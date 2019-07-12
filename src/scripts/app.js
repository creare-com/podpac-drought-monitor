var currentPage = 'map';
var currentAxisType = 'ndmi';

// First time run functions
var geolocation = null;
var old_geolocation = [null, null];
var rawData = null;
var marker = null;
var coords = null;
var coords2 = null;

// used to get categories for specific NDMI dates
var pipeline_category = null;
var pipeline_moisture = null;
var pipeline_d0 = null;
var pipeline_d1 = null;
var pipeline_d2 = null;
var pipeline_d3 = null;
var pipeline_d4 = null;
var test_pipeline = null

var PODPACcfg = {
    s3: null,
    inFolder: "esip_input",
    outFolder: 'esip_output'
};

// S3 Configuration
var lambdaS3Bucket = 'podpac-s3';
var s3 = null;
$.getJSON('json/config.json', function(json) {
    AWS.config.update(json);
    s3 = new AWS.S3({
        apiVersion: '2006-03-01',
        params: {
            Bucket: lambdaS3Bucket
        }
    });
    PODPACcfg.s3 = s3;
});

$.getJSON('json/coords_template.json', function(json) {
    coords = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/coords_template2.json', function(json) {
    coords2 = json;
    get_data(geolocation, rawData);
})

$.getJSON('json/pipeline_category.json', function(json) {
    pipeline_category = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_moisture.json', function(json) {
    pipeline_moisture = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_d0.json', function(json) {
    pipeline_d0 = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_d1.json', function(json) {
    pipeline_d1 = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_d2.json', function(json) {
    pipeline_d2 = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_d3.json', function(json) {
    pipeline_d3 = json;
    get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_d4.json', function(json) {
    pipeline_d4 = json;
    get_data(geolocation, rawData);
})

$("#map").css("height", get_height());

// Create Leaflet Layers
var OpenStreetMap_Mapnik = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
var OpenStreetMap_Stamen = L.tileLayer('http://a.tile.stamen.com/toner/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
var DroughtWMSOptions = {
    layers: "usdm_current",
    transparent: true,
    transparency: true,
    opacity: 0.95,
    format: 'image/png'
};
var DroughtWMS = L.tileLayer.wms("http://ndmc-001.unl.edu:8080/cgi-bin/mapserv.exe?map=/ms4w/apps/usdm/service/usdm_current_wms.map&", DroughtWMSOptions);

var baseMaps = {
    "OpenStreetMap": OpenStreetMap_Mapnik
};
var overlayMaps = {
    "NDMI": DroughtWMS
};

// Initial leaflet MAP
var map = L.map('map', {
    center: [42, -100.0],
    zoom: 4,
    layers: [OpenStreetMap_Mapnik]
});
L.control.layers(baseMaps, overlayMaps).addTo(map);

// Set up listeners etc. to handle specification for the markers
map.on('click', function(e) {

    // set input based on geolocation
    var coords = e.latlng;
    $("#lat")[0].value = coords['lat'];
    $("#lon")[0].value = coords['lng'];
    updatePlot();
    setPage('plot');
})

// Update the map on first entry
updateMap();
setPage(currentPage);
