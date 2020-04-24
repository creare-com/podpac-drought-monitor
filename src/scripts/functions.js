
// Page Router
function setPage(toPage) {
    $(`#${currentPage}`).hide();
    $(`#${currentPage}link`).removeClass('active');
    $(`.${currentPage}-legend`).hide();
    $(`#${toPage}`).show();
    $(`.${toPage}-legend`).show();
    $(`#${toPage}link`).addClass('active');
    currentPage = toPage;

    if (currentPage === 'plot') {
        updatePlot();
    }

    // HACK to get tiles to load. See https://github.com/Leaflet/Leaflet/issues/694
    if (currentPage === 'map') {
        setTimeout(function(){ map.invalidateSize() }, 300);
    }
}

// Functions used throughout //
function getPODPACLambda(cfg, pipeline, coordinates, name, rData) {
    if (pipeline === null | coordinates === null) {
        return;
    }

    let func = function(err, data) {
        if (err)
            console.log(err, err.stack);
        else {
            let json = data.Payload;
            json = json.replace(/NaN/g, 'null');
            try {
                addRawData(rData, JSON.parse(JSON.parse(json)), name);
            } catch {
                console.log(json);
            }
        }
    }

    if (cfg.lambda !== null) {
        let postFilename = Object.keys(pipeline)[Object.keys(pipeline).length - 1] + '_output_' + SparkMD5.hash(JSON.stringify({
            'nodes': pipeline
        })) + '_' + SparkMD5.hash('output') + '_' + SparkMD5.hash(JSON.stringify(coordinates)) + '.json';
        // Make the full pipeline json
        let pipeline_json = JSON.stringify({
            'pipeline': pipeline,
            'output': {"format": "json", "mode": "file"},
            'coordinates': coordinates,
            'settings': cfg.settings
        });
        let params = JSON.parse(JSON.stringify(cfg.params));
        params['Payload'] = pipeline_json;
        console.log(name);
        console.log(params);
        cfg.lambda.invoke(params, func);
    }
}

function addRawData(rData, data, name) {
    for (let i = 0; i < data.coords.time.data.length; i++) {
        let key = data.coords.time.data[i].slice(0, 10).replace(/-/g, '\/');
        if (rData[key] === undefined) {
            rData[key] = {};
        }
        rData[key][name] = data.data[0][0][i];
    }
    updatePlot();
    return rData;
}

// Function that retrieves the data -- returns dummy data for now
function get_data(geolocation, rawData) {
    if (geolocation === null | rawData == null) {
        return;
    }
    // To retrieve the NDMI data we need the county fips code -- use the fcc's census api to get this from the lat/lon
    var fips_request;
    var fips_json = null;
    var fips_code_county = null;
    var rawNDMI = null;

    var nowdate = new Date();
    var offsetdate = new Date();
    offsetdate.setMonth(Math.max(-3, nowdate.getMonth() - 3));

    var enddate = nowdate.toLocaleDateString();
    var startdate = offsetdate.toLocaleDateString();

    offsetdate.setDate(Math.max(0, nowdate.getDate() - 7));

    // Fill the coordinates template
    if (coords !== null) {
        for (let i = 0; i < coords.coords.length; i++) {
            if (coords.coords[i].name == "lat") {
                coords.coords[i].values = [Math.round(parseFloat(geolocation[0])*100)/100];
            } else if (coords.coords[i].name == "lon") {
                coords.coords[i].values = [Math.round(parseFloat(geolocation[1])*100)/100];
            } else if (coords.coords[i].name == "time") {
                coords.coords[i].start = offsetdate.toISOString().slice(0, 10);
                coords.coords[i].stop = nowdate.toISOString().slice(0, 10);
            }
        }
        // Fetch the PODPAC pipeline data\
        // The next snippet should go in podpac.js 
        //                     let drought_category = null;
        //                     getPODPACLambda(PODPACcfg, pipeline_category, coords, function(json) {
        //                         drought_category = json;
        //                         if (rawData.SMAP.length == 0){
        //                             rawData = initSMAPRawData(rawData, drought_category, "category");
        //                         } else {
        //                             rawData = addSMAPRawData(rawData, drought_category, "category");
        //                         }
        //                     });
        getPODPACLambda(PODPACcfg, pipeline_category_time, coords, 'category', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_moisture_time, coords, 'moisture', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_d0, coords, 'd0', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_d1, coords, 'd1', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_d2, coords, 'd2', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_d3, coords, 'd3', rawData.SMAP);
        getPODPACLambda(PODPACcfg, pipeline_d4, coords, 'd4', rawData.SMAP);
    }

    // Fetch the NDMI data
    $.get('https://geo.fcc.gov/api/census/area', {
        lat: $('#lat')[0].value,
        lon: $('#lon')[0].value,
        format: 'json'
    }, function(data) {
        fips_json = data;
        if (fips_json.results.length > 0) {
            fips_code_county = fips_json.results[0].county_fips;
        } else {
            return;
        }

        // Get the NDMI data
        // example https://usdmdataservices.unl.edu/api/USStatistics/GetDroughtSeverityStatisticsByArea?aoi=us&startdate=1/1/2019&enddate=1/1/2020&statisticsType=1
        $.ajax({
            url: 'https://cors-anywhere.herokuapp.com/https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByArea',
            type: 'GET',
            contentType: 'text/plain',
            xhrFields: {
                withCredentials: false
            },
            data: {
                aoi: fips_code_county,
                startdate: startdate,
                enddate: enddate,
                statisticsType: 1
            },
            accepts: 'json',
            success: function(data) {
                // we'll need to get this through podpac for the dates in rawNDMI
                cats = {
                    d5: null,
                    d4: null,
                    d3: null,
                    d2: null,
                    d1: null,
                    d0: null,
                    dn: null
                }
                let rawNDMI = data;
                let times = [];
                for (let i = 0; i < rawNDMI.length; i++) {
                    var tot_area = parseFloat(rawNDMI[i]["None"].replace(',', ''));
                    var mean_cat = 5.5 * tot_area;
                    for (var j = 0; j < 5; j++) {
                        var area = parseFloat(rawNDMI[i]["D" + j].replace(',', ''));
                        tot_area = tot_area + area;
                        mean_cat = mean_cat + (4.5 - j) * area;
                    }
                    let locNDMI = mean_cat / tot_area;
                    let key = rawNDMI[i].MapDate;
                    // Standardize date representation
                    key = key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6, 8)
                    times.push(key);
                    key = key.replace(/-/g, '\/');
                    rawData.NDMI[key] = {
                        NDMI: locNDMI
                    };
                }
                // Ammend/fix the NDMI data with categories (for translation to soil moisture)
                if (coords2 !== null) {
                    for (let i = 0; i < coords2.coords.length; i++) {
                        if (coords2.coords[i].name == "lat") {
                            coords2.coords[i].values = [Math.round(parseFloat(geolocation[0])*100)/100];
                        } else if (coords2.coords[i].name == "lon") {
                            coords2.coords[i].values = [Math.round(parseFloat(geolocation[1])*100)/100];
                        } else if (coords2.coords[i].name == "time") {
                            coords2.coords[i].values = times;
                        }
                    }
                    getPODPACLambda(PODPACcfg, pipeline_d0, coords2, 'd0', rawData.NDMI);
                    getPODPACLambda(PODPACcfg, pipeline_d1, coords2, 'd1', rawData.NDMI);
                    getPODPACLambda(PODPACcfg, pipeline_d2, coords2, 'd2', rawData.NDMI);
                    getPODPACLambda(PODPACcfg, pipeline_d3, coords2, 'd3', rawData.NDMI);
                    getPODPACLambda(PODPACcfg, pipeline_d4, coords2, 'd4', rawData.NDMI);
                }
                updatePlot();
            }
        });
    });

    return rawData;
}

// Function that converts soil moisture to NDMI based on the drought categories
function soilmoistureToNDMI(data) {
    outData = {
        "values": []
    }
    let SMAPentries = Object.entries(data.SMAP);
    let NDMIentries = Object.entries(data.NDMI);
    let i = 0;
    for (var iii = 0; iii < SMAPentries.length; iii++) {
        if (SMAPentries[iii][1].category == null){
            continue;
        }
        outData.values.push({});

        if (SMAPentries[iii][1].category !== undefined) {
            outData.values[i].moisture = SMAPentries[iii][1].category;
        }

        outData.values[i].d5 = 0;
        outData.values[i].d4 = 1;
        outData.values[i].d3 = 2;
        outData.values[i].d2 = 3;
        outData.values[i].d1 = 4;
        outData.values[i].d0 = 5;
        outData.values[i].dn = 6;
        outData.values[i].date1 = SMAPentries[iii][0];
        i = i + 1;
    }
    
    for (var iii = 0; iii < NDMIentries.length; iii++) {
        outData.values.push({});

        // No conversion needed
        outData.values[iii].NDMI = NDMIentries[iii][1].NDMI;
        outData.values[iii].date = NDMIentries[iii][0];
    }
    return outData;
}

// Function that converts NDMI to soil moisture based on the drought categories
function NDMIToSoilmoisture(data) {
    outData = {
        "values": []
    }
    let SMAPentries = Object.entries(data.SMAP);
    let NDMIentries = Object.entries(data.NDMI);
    for (var i = 0; i < NDMIentries.length; i++) {
        outData.values.push({});

        if (NDMIentries[i][1].NDMI < 1) {
            NDMI = (NDMIentries[i][1].NDMI - 0) * (NDMIentries[i][1].d4 - 0) + 0;
        } else if (NDMIentries[i][1].NDMI < 2) {
            NDMI = (NDMIentries[i][1].NDMI - 1) * (NDMIentries[i][1].d3 - NDMIentries[i][1].d4) + NDMIentries[i][1].d4;
        } else if (NDMIentries[i][1].NDMI < 3) {
            NDMI = (NDMIentries[i][1].NDMI - 2) * (NDMIentries[i][1].d2 - NDMIentries[i][1].d3) + NDMIentries[i][1].d3;
        } else if (NDMIentries[i][1].NDMI < 4) {
            NDMI = (NDMIentries[i][1].NDMI - 3) * (NDMIentries[i][1].d1 - NDMIentries[i][1].d2) + NDMIentries[i][1].d2;
        } else if (NDMIentries[i][1].NDMI < 5) {
            NDMI = (NDMIentries[i][1].NDMI - 4) * (NDMIentries[i][1].d0 - NDMIentries[i][1].d1) + NDMIentries[i][1].d1;
        } else {
            NDMI = (NDMIentries[i][1].NDMI - 5) * (0.5 - NDMIentries[i][1].d0) + NDMIentries[i][1].d0;
        }
        outData.values[i].NDMI = NDMI;
        outData.values[i].date = NDMIentries[i][0];

    }
    let iii = 0;
    for (var i = 0; i < SMAPentries.length; i++) {
        if (SMAPentries[i][1].moisture == null){
            continue;
        }
        outData.values.push({});
        if (SMAPentries[iii][1].moisture !== undefined) {
            outData.values[iii].moisture = SMAPentries[i][1].moisture;
        }
        outData.values[iii].d5 = 0;
        outData.values[iii].d4 = SMAPentries[i][1].d4;
        outData.values[iii].d3 = SMAPentries[i][1].d3;
        outData.values[iii].d2 = SMAPentries[i][1].d2;
        outData.values[iii].d1 = SMAPentries[i][1].d1;
        outData.values[iii].d0 = SMAPentries[i][1].d0;
        outData.values[iii].dn = 0.5;
        outData.values[iii].date1 = SMAPentries[i][0];
        iii = iii + 1;
    }
    return outData;
}

function get_geolocation() {
    new_geolocation = [$('#lat')[0].value, $('#lon')[0].value]
    if (new_geolocation[0] !== "" & new_geolocation[1] !== "") {
        geolocation = new_geolocation;
        return;
    }

    function setPosition(position) {
        $('#lat')[0].value = position.coords.latitude;
        $('#lon')[0].value = position.coords.longitude;
        geolocation = [position.coords.latitude, position.coords.longitude];
        updateMap();  // callback to update the map since now lat/lon are defined
    }

    function showError(error) {
        x = $('#message')[0];
        geolocation = undefined;
        switch (error.code) {
        case error.PERMISSION_DENIED:
            x.innerHTML = "User denied the request for Geolocation."
            setPage('map');
            break;
        case error.POSITION_UNAVAILABLE:
            x.innerHTML = "Location information is unavailable."
            break;
        case error.TIMEOUT:
            x.innerHTML = "The request to get user location timed out."
            break;
        case error.UNKNOWN_ERROR:
            x.innerHTML = "An unknown error occurred."
            break;
        }
    }

    if (navigator.geolocation) {
        if (geolocation === null) {
            navigator.geolocation.getCurrentPosition(setPosition, showError);
        }
    } else {
        $('#message')[0].innerHTML = "Geolocation is not supported by this browser. Please enter location manually.";
        geolocation = undefined;
    }
}

// Define the colors for the legend
var legend = {
    "DN": "#FFFFFF",
    "D0": "#FFFF00",
    "D1": "#FCD37F",
    "D2": "#FFAA00",
    "D3": "#E60000",
    "D4": "#730000"
}

// Get the height for the map and plot elements
function get_height() {
    var margin = $('body').css('margin').replace('px', '');
    if (margin === "") {
        margin = 0;
    } else {
        margin = parseInt(margin);
    }
    return $(window).height() - $('#nav').height() - margin * 2 - 16;
}


// Update marker on the map
function updateMap() {
    get_geolocation();

    if (geolocation === null || geolocation === undefined) {
        return;
    }

    if (marker !== null) {
        marker.removeFrom(map);
    }
    marker = L.marker(geolocation, {
        draggable: true
    }).addTo(map);

    marker.on('dragend', function() {
        var coords = marker.getLatLng();
        $("#lat")[0].value = coords['lat'];
        $("#lon")[0].value = coords['lng'];
        updatePlot();
        setPage('plot');
    });
}

// Updates the plot data depending on user selections
function updatePlot(axisType) {

    // update axisType
    if (axisType) {
        $(`#${currentAxisType}-button`).removeClass('active');
        $(`#${axisType}-button`).addClass('active');
        currentAxisType = axisType;
    }

    get_geolocation();

    if (geolocation === null || geolocation === undefined) {
        return;
    }
    if ((rawData === null) || (old_geolocation[0] != geolocation[0]) | (old_geolocation[1] != geolocation[1])) {
        rawData = {
            SMAP: {},
            NDMI: {}
        };
        rawData = get_data(geolocation, rawData);
        old_geolocation = geolocation;
    }

    let plot_data = null;
    let domain = null;
    let axis = {
        "labelFontSize": 24,
        "titleFontSize": 24,
    }
    if (currentAxisType === "ndmi") {
        plot_data = soilmoistureToNDMI(rawData);
        domain = [0, 6];
        axis.title = "Drought Category";
        axis.tickCount = 0;

    } else if (currentAxisType === "sm") {
        plot_data = NDMIToSoilmoisture(rawData);
        //                     domain = [Math.min.apply(Math, rawData.SMAP.map(function(o) {
        //                         if (o.moisture === undefined) {
        //                             return 1;
        //                         } else {
        //                             return o.moisture;
        //                         }
        //                     })), Math.max.apply(Math, rawData.SMAP.map(function(o) {
        //                         if (o.moisture == undefined) {
        //                             return 0;
        //                         } else {
        //                             return o.moisture;
        //                         }
        //                     }))];
        let smapMax = Math.max.apply(Math, Object.values(rawData.SMAP).map(function(o) {
            if (o.moisture == undefined) {
                return 0;
            } else {
                return o.moisture;
            }
        }));
        let ndmiMax = Math.max.apply(Math, plot_data.values.map(function(o) {
            if (o.NDMI == undefined) {
                return 0;
            } else {
                return o.NDMI;
            }
        }));
        domain = [0, Math.max(ndmiMax, smapMax)];
        axis.title = "Soil Moisture (m³/m³)";
        axis.tickCount = 5;
    }

    let vlSpec = makeVLSpec(plot_data, domain, axis);

    // Embed the visualization in the container with id `vis`
    vegaEmbed('#vis', vlSpec);
}

// Makes the JSON spec for the Vega-lite plot
function makeVLSpec(data, domain, axis) {
    let vlSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
        "width": $('#plot').width(),
        "height": get_height()*.7,
        "autosize": {
            "type": "fit",
            "contains": "padding"
        },
        "data": data,

        "layer": [// Each Entry in the Layers define a plot
        {
            // Cat 4 drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["D4"]
            },
            "encoding": {
                "y": {
                    "field": "d4",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": axis,
                },
                "y2": {
                    "field": "d5",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // Cat 3 drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["D3"]
            },
            "encoding": {
                "y": {
                    "field": "d3",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "y2": {
                    "field": "d4",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // Cat 2 drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["D2"]
            },
            "encoding": {
                "y": {
                    "field": "d2",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "y2": {
                    "field": "d3",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // Cat 1 drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["D1"]
            },
            "encoding": {
                "y": {
                    "field": "d1",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "y2": {
                    "field": "d2",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // Cat 0 drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["D0"]
            },
            "encoding": {
                "y": {
                    "field": "d0",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "y2": {
                    "field": "d1",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // Not in drought area layer
            "mark": {
                "opacity": 1.0,
                "type": "area",
                "color": legend["DN"]
            },
            "encoding": {
                "y": {
                    "field": "d0",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "y2": {
                    "field": "dn",
                    "type": "quantitative"
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                },
                "tooltip": null
            }
        }, {
            // NDMI Line
            "mark": {
                "type": "line",
                "color": "#000000",
                "opacity": 1.0,
                "strokeDash": [1, 10],
                "point": {
                    "type": "circle",
                    "size": 500,
                    "color": "#000000",
                    "opacity": 1.0
                }
            },
            "encoding": {
                "y": {
                    "field": "NDMI",
                    "scale": {
                        "domain": domain
                    },
                    "type": "quantitative",
                    "axis": {
                        "title": "",
                        "tickCount": axis.tickCount
                    }
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date",
                    "type": "temporal",
                    "axis": {
                        "title": "Date",
                        "labelFontSize": 24,
                        "titleFontSize": 24,
                        "format": "%m/%d/%y",
                        "labelAngle": -60,
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                }
            }
        }, {
            // SMAP line
            "mark": {
                "type": "line",
                "color": "#BB9999",
                "size": "3",
                "point": {
                    "type": "square",
                    "color": "#BB9999",
                    "size": "75"
                }
            },
            "selection": {
                // SELECTION IS HERE
                "brush": {
                    "type": "interval",
                    "bind": "scales",
                    "encodings": ["x"]
                }
            },
            "encoding": {
                "y": {
                    "scale": {
                        "domain": domain
                    },
                    "field": "moisture",
                    "type": "quantitative",
                },
                "x": {
                    // This defines the x-axis and label
                    "field": "date1",
                    "type": "temporal",
                    "axis": {
                        "title": "",
                    },
                    "scale": {
                        "domain": {
                            "selection": "brush"
                        }
                    }
                }
            }
        }, ],
        //                 "resolve": {
        //                     "scale": {
        //                         "y": "independent"
        //                     }
        //                 }
    };
    return vlSpec;
}
