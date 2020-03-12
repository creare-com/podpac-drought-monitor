var currentPage = 'map';
var currentAxisType = 'ndmi';
var nowdate = new Date();
nowdate.setDate(nowdate.getDate() - 2);

// First time run functions
var geolocation = null;
var old_geolocation = [null, null];
var rawData = null;
var marker = null;
var settings = {};
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
  params: {
    FunctionName: 'podpac-drought-monitor-lambda',
    //         InvocationType : 'Event',
    InvocationType: 'RequestResponse',
    LogType: 'None'
  },
  lambda: null,
  settings: {}
};

// Lambda Configuration
AWS.config.region = 'us-east-1'
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

$.getJSON('json/pipeline_category_l3am.json', function(json) {
  pipeline_category = json;
  get_data(geolocation, rawData);
})
$.getJSON('json/pipeline_moisture_l3am.json', function(json) {
  pipeline_moisture = json;
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

var DroughtWMSOptions;
var DroughtWMS;
var SMAPWMSOptions;
var SMAPWMS;
var SMAPSMWMSOptions;
var SMAPSMWMS;

function updateLayers() {
  DroughtWMSOptions = {
    layers: "usdm_current",
    transparent: true,
    transparency: true,
    opacity: 0.95,
    format: 'image/png',
  };
  DroughtWMS = L.tileLayer.wms("http://ndmc-001.unl.edu:8080/cgi-bin/mapserv.exe?map=/ms4w/apps/usdm/service/usdm_current_wms.map&", DroughtWMSOptions);

  SMAPWMSOptions = {
    layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_category.json",
    transparent: true,
    transparency: true,
    opacity: 0.95,
    time: nowdate.toISOString(),
    format: 'image/png'
  };
  SMAPWMS = L.tileLayer.wms("https://ps1dfpoecf.execute-api.us-east-1.amazonaws.com/prod/eval/?", SMAPWMSOptions);

  SMAPSMWMSOptions = {
    layers: "https://podpac-drought-monitor-s3.s3.amazonaws.com/pipeline_moisture.json",
    transparent: true,
    transparency: true,
    opacity: 0.95,
    time: nowdate.toISOString(),
    format: 'image/png'
  };
  SMAPSMWMS = L.tileLayer.wms("https://ps1dfpoecf.execute-api.us-east-1.amazonaws.com/prod/eval/?", SMAPSMWMSOptions);
}
updateLayers();


var baseMaps = {
  "OpenStreetMap": OpenStreetMap_Mapnik
};
var overlayMaps = {
  "SMAP VSM": SMAPSMWMS,
  "NDMI": DroughtWMS,
  "SMAP DMI": SMAPWMS
};

// Initial leaflet MAP
var map = L.map('map', {
  center: [42, -100.0],
  zoom: 4,
  layers: [OpenStreetMap_Mapnik],
});
L.control.layers(baseMaps, overlayMaps, {
  collapsed: false
}).addTo(map);

// Initial daterangepicker
$('input[name="daterange"]').click(function(event) {
  event.stopPropagation();
});
$('input[name="daterange"]').daterangepicker({
  singleDatePicker: true,
  showDropdowns: true,
  startDate: nowdate,
  minYear: 1985, // TODO: This should be the minDate of the data layers.
  maxDate: moment()
}, function(start, end, label) {
  console.log("new date selected: " + start.toISOString());
  nowdate = start; // start === end for singleDatePicker
  updateLayers();
  updateMap();
});

// Set up listeners etc. to handle specification for the markers
map.on('click', function(e) {

  // set input based on geolocation
  var coords = e.latlng;
  $("#lat")[0].value = coords['lat'];
  $("#lon")[0].value = coords['lng'];
  updatePlot();
  updateMap();
  // setPage('plot');
});

var loadingControl = L.Control.loading({
  separate: true
});
map.addControl(loadingControl);

SMAPWMS.on('loading', function(e) {
  loadingControl._showIndicator()
});
SMAPWMS.on('load', function(e) {
  loadingControl._hideIndicator()
});
SMAPSMWMS.on('loading', function(e) {
  loadingControl._showIndicator()
});
SMAPSMWMS.on('load', function(e) {
  loadingControl._hideIndicator()
});

// Set default layers
map.addLayer(DroughtWMS);
map.addLayer(SMAPWMS);

// Update the map on first entry
updateMap();
setPage(currentPage);
