var currentPage = 'plot';
var toPage = 'map';
var currentAxisType = 'ndmi';
var nowdate = moment();
var queryDate = moment();
queryDate.subtract(2, "days");
$(`#smapDate`).text("SMAP Date: " + queryDate.format("MMM D, YYYY"));
var ndmiDate = moment(nowdate);
$(`#ndmiDate`).text("NDMI Date: " + ndmiDate.format("MMM D, YYYY"));

var ndmiDates = [];
var currentNdmiDate = moment("2000-01-04");
while(currentNdmiDate.isSameOrBefore(moment(nowdate), "day")) {
  ndmiDates.push(currentNdmiDate.format("YYYYMMDD"));
  currentNdmiDate.add(7, "days");
}

// First time run functions
var geolocation = null;
var old_geolocation = [null, null];
var rawData = null;
var marker = null;
var settings = {};
var coords = null;
var coords2 = null;

// used to get categories for specific NDMI dates
var pipeline_category_space = null;
var pipeline_category_space_us = null;
var pipeline_category_time = null;
var pipeline_moisture_space = null;
var pipeline_moisture_time = null;
var pipeline_d0 = null;
var pipeline_d1 = null;
var pipeline_d2 = null;
var pipeline_d3 = null;
var pipeline_d4 = null;
var test_pipeline = null;

// API URL
var pipeline_api_url = 'https://e5nu2vek1a.execute-api.us-east-1.amazonaws.com/prod/eval/?';

var PODPACcfg = {
  params: {
    FunctionName: 'podpac-drought-monitor-lambda-world',
    //         InvocationType : 'Event',
    InvocationType: 'RequestResponse',
    LogType: 'None'
  },
  lambda: null,
  settings: {}
};

// Lambda Configuration
AWS.config.region = 'us-east-1';
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: 'us-east-1:6d5095bc-b9b6-42a7-ae6e-03b74431d949',
});
PODPACcfg.lambda = new AWS.Lambda({
  apiVersion: '2015-03-31'
});


// PODPAC Settings
// $.getJSON('json/settings.json', function(json) {
//     settings = json;
//     PODPACcfg.settings = settings;
// });

// APPLICATION JSON

$.getJSON('json/coords_template.json', function(json) {
  coords = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/coords_template2.json', function(json) {
  coords2 = json;
  get_data(geolocation, rawData);
});

$.getJSON('json/pipeline_category_space.json', function(json) {
  pipeline_category_space = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_category_space_us.json', function(json) {
  pipeline_category_space_us = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_category_time.json', function(json) {
  pipeline_category_time = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_moisture_space.json', function(json) {
  pipeline_moisture_space = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_moisture_time.json', function(json) {
  pipeline_moisture_time = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_d0.json', function(json) {
  pipeline_d0 = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_d1.json', function(json) {
  pipeline_d1 = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_d2.json', function(json) {
  pipeline_d2 = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_d3.json', function(json) {
  pipeline_d3 = json;
  get_data(geolocation, rawData);
});
$.getJSON('json/pipeline_d4.json', function(json) {
  pipeline_d4 = json;
  get_data(geolocation, rawData);
});

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
  format: 'image/png',
};
var DroughtWMS = L.tileLayer.wms("http://ndmc-001.unl.edu:8080/cgi-bin/mapserv.exe?map=/ms4w/apps/usdm/service/usdm_current_wms.map&", DroughtWMSOptions);

var SMAPWMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_category_space.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPWMS = L.tileLayer.wms(pipeline_api_url, SMAPWMSOptions);

var SMAPUSWMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_category_space_us.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPUSWMS = L.tileLayer.wms(pipeline_api_url, SMAPUSWMSOptions);

var SMAPSMWMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_moisture_space.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPSMWMS = L.tileLayer.wms(pipeline_api_url, SMAPSMWMSOptions);

var SMAPD0WMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_d0.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPD0WMS = L.tileLayer.wms(pipeline_api_url, SMAPD0WMSOptions);

var SMAPD1WMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_d1.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPD1WMS = L.tileLayer.wms(pipeline_api_url, SMAPD1WMSOptions);

var SMAPD2WMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_d2.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPD2WMS = L.tileLayer.wms(pipeline_api_url, SMAPD2WMSOptions);

var SMAPD3WMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_d3.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPD3WMS = L.tileLayer.wms(pipeline_api_url, SMAPD3WMSOptions);

var SMAPD4WMSOptions = {
  layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_d4.json",
  transparent: true,
  transparency: true,
  opacity: 0.95,
  time: queryDate.toISOString(),
  format: 'image/png'
};
var SMAPD4WMS = L.tileLayer.wms(pipeline_api_url, SMAPD4WMSOptions);

var timeWmsLayers = [SMAPWMS, SMAPUSWMS, SMAPSMWMS, SMAPD0WMS, SMAPD1WMS, SMAPD2WMS, SMAPD3WMS, SMAPD4WMS];

var baseMaps = {
  "OpenStreetMap": OpenStreetMap_Mapnik
};
var map = null;
if (map_prefs==="us"){
  var overlayMaps = {
//   "SMAP D0": SMAPD0WMS,
//   "SMAP D1": SMAPD1WMS,
//   "SMAP D2": SMAPD2WMS,
//   "SMAP D3": SMAPD3WMS,
//   "SMAP D4": SMAPD4WMS,
  "SMAP Soil Moisture": SMAPSMWMS,
  "NDMI": DroughtWMS,
//   "SMAP DMI World": SMAPWMS,
  "SMAP DMI US": SMAPUSWMS
  };
  // Initial leaflet MAP
  var map = L.map('map', {
    center: [42, -100.0],
    zoom: 4,
    layers: [OpenStreetMap_Mapnik],
  });
} else {
var overlayMaps = {
  "SMAP D0": SMAPD0WMS,
  "SMAP D1": SMAPD1WMS,
  "SMAP D2": SMAPD2WMS,
  "SMAP D3": SMAPD3WMS,
  "SMAP D4": SMAPD4WMS,
  "SMAP Soil Moisture": SMAPSMWMS,
  "NDMI": DroughtWMS,
  "SMAP DMI World": SMAPWMS,
  "SMAP DMI US": SMAPUSWMS
  };
  // Initial leaflet MAP
  var map = L.map('map', {
    center: [0, 0.0],
    zoom: 2,
    layers: [OpenStreetMap_Mapnik],
  });
}

L.control.layers(baseMaps, overlayMaps, {
  collapsed: false
}).addTo(map);

function updateLayers() {
  timeWmsLayers.forEach((layer, index) => {
    layer.setParams({
      time: queryDate.toISOString()
    });
  });

  if (nowdate.isSame(ndmiDate, "day") || nowdate.isBetween(ndmiDate, moment(ndmiDate).add(7, "days"), "day")) {
    // Don't want to query for data if it will be same date
    return;
  }

  var ndmiQueryMoment = moment(nowdate);
  for (var index = 0; index < 7; index++) {
    var ndmiQueryString = ndmiQueryMoment.format("YYYYMMDD");
    if (ndmiDates.includes(ndmiQueryString)) {
      ndmiDate = moment(ndmiQueryMoment);
      $(`#ndmiDate`).text("NDMI Date: " + ndmiDate.format("MMM D, YYYY"));
      DroughtWMS.setParams({
        layers: "usdm" + ndmiQueryString
      }, true); // Don't redraw yet, need to setUrl too.
      var url = DroughtWMS._url.replace(/usdm_.*_wms/, "usdm_" + ndmiQueryString + "_wms");
      DroughtWMS.setUrl(url);
      return;
    }
    ndmiQueryMoment.subtract(1, "days");
  }
  console.log("ERROR: couldn't determine a valid date for NDMI data.");
}

// Initial daterangepicker
$('input[name="daterange"]').click(function(event) {
  event.stopPropagation();
});
$('input[name="daterange"]').daterangepicker({
  singleDatePicker: true,
  showDropdowns: true,
  startDate: nowdate,
  minDate: moment("2000-01-04"), // First date NDMI data is available.
  maxDate: moment()
}, function(start, end, label) {
  console.log("new date selected: " + start.toISOString());
  nowdate = moment(start); // start === end for singleDatePicker
  queryDate = moment(nowdate);
  queryDate.subtract(2, "days");
  $(`#smapDate`).text("SMAP Date: " + queryDate.format("MMM D, YYYY"));
  updateLayers();
  updateMap();
});

// Set up listeners etc. to handle specification for the markers
map.on('click', function(e) {

  // set input based on geolocation
  var coords = e.latlng;
  $("#lat")[0].value = coords.lat;
  $("#lon")[0].value = coords.lng;
  updatePlot();
  updateMap();
  // setPage('plot');
});

var loadingControl = L.Control.loading({
  separate: true
});
map.addControl(loadingControl);

SMAPWMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPWMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPUSWMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPUSWMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPSMWMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPSMWMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPD0WMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPD0WMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPD1WMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPD1WMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPD2WMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPD2WMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPD3WMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPD3WMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
SMAPD4WMS.on('loading', function(e) {
  loadingControl._showIndicator();
});
SMAPD4WMS.on('load', function(e) {
  loadingControl._hideIndicator();
});
// Set default layers
map.addLayer(DroughtWMS);
if (map_prefs==='us'){
  map.addLayer(SMAPUSWMS);
} else {
  map.addLayer(SMAPWMS);
}

// Update the map on first entry
updateMap();
setPage(toPage);
