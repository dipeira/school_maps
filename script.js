import { INITIAL_LAT, INITIAL_LONG, LOCATIONS_FILE, POLYGONS_FILE } from './params.js';

var map = L.map('map').setView([INITIAL_LAT, INITIAL_LONG], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 28,
}).addTo(map);

var addressInput = $('#addressInput');
var marker;

// Initialize Select2 for address search
addressInput.select2({
  placeholder: 'Εισάγετε ταχυδρομική διεύθυνση',
  ajax: {
    url: 'https://nominatim.openstreetmap.org/search',
    dataType: 'json',
    delay: 250,
    data: function(params) {
      var viewBounds = map.getBounds();
      return {
        q: params.term,
        format: 'json',
        bounded: 1,
        viewbox: viewBounds.getWest() + ',' + viewBounds.getSouth() + ',' + viewBounds.getEast() + ',' + viewBounds.getNorth(),
        accept_language: 'el'
      };
    },
    processResults: function(data) {
      return {
        results: $.map(data, function(item) {
          return {
            id: item.place_id,
            text: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          };
        })
      };
    },
    cache: true
  },
  minimumInputLength: 3,
  language: {
    inputTooShort: function() {
      return "Παρακαλώ εισάγετε 3 ή περισσότερους χαρακτήρες";
    }
  }
});

// add school locations as a points layer and display school name on click
function addPointsLayer() {
  $.getJSON(LOCATIONS_FILE, function(data) {
    L.geoJSON(data, {
      pointToLayer: function(feature, latlng) {
        return L.marker(latlng, {
          icon: L.icon({
            iconUrl: 'images/school.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          })
        });
      },
      onEachFeature: function(feature, layer) {
        layer.on('click', function() {
          // Use geozone_title for map.geojson points
          var popupContent = feature.properties.geozone_title || feature.properties.name;
          layer.bindPopup(popupContent).openPopup();
        });
      }
    }).addTo(map);
  });
}

// Add points layer to the map
addPointsLayer();

var allPolygons = []; // Store all polygons globally

// Function to add school polygons to the map
function addPolygons() {
    var polygons = [POLYGONS_FILE];

    polygons.forEach(file => {
      $.getJSON(file, function(data) {
        if (!data || !Array.isArray(data.features)) return;
    
        // Normalize names for sorting and display
        var features = data.features
            .filter(f => f.properties && (f.properties.name || f.properties.geozone_title))
            .sort((a, b) => {
              let nameA = a.properties.name || a.properties.geozone_title;
              let nameB = b.properties.name || b.properties.geozone_title;
              return nameA.localeCompare(nameB);
            });
    
        var geojsonLayer = L.geoJSON(features, {
            style: function(feature) {
                var colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#008000', '#800080', '#808080', '#ff0080', '#00ff80'];
                var id = feature.properties.cartodb_id || feature.properties.polygon_id || 0;
                return {
                    fillColor: colors[id % colors.length],
                    fillOpacity: 0.2,
                    color: 'black',
                    weight: 1
                };
            },
            onEachFeature: function(feature, layer) {
                // Check for any area-based geometry (Polygon or MultiPolygon)
                if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
                    let displayName = feature.properties.name || feature.properties.geozone_title;
                    var tableRow = $('<tr>').append($('<td>').text(displayName));
                    
                    tableRow.on('click', function() {
                        $('#polygonTable tbody tr.active').removeClass('active table-primary');
                        $(this).addClass('active table-primary');
                        map.fitBounds(layer.getBounds());
                    });
    
                    $('#polygonTable tbody').append(tableRow);
                }
            }
        }).addTo(map);
    
        allPolygons.push(geojsonLayer);
      });
    });
}

// Function to check if a location is inside a polygon
function checkPolygon(latlng) {
  $('#result').html('');
  let foundResult = null;
  var point = [latlng.lng, latlng.lat];

  allPolygons.forEach(geojsonLayer => {
      geojsonLayer.eachLayer(layer => {
          // Robust check for Polygon/MultiPolygon
          if (layer.feature.geometry.type.includes("Polygon")) {
              if (leafletPip.pointInLayer(point, L.geoJSON(layer.toGeoJSON())).length > 0) {
                  let props = layer.feature.properties;
                  foundResult = {
                      name: props.name || props.geozone_title,
                      address: props.address || "N/A",
                      phone: props.telephone || "N/A",
                      email: props.email || "N/A"
                  };
              }
          }
      });
  });

  if (foundResult) {
      const msg = `Η επιλεγμένη τοποθεσία ανήκει στο σχολείο: <br><b>${foundResult.name}</b><br>Δ/νση: ${foundResult.address}<br>Τηλ.: ${foundResult.phone}<br>email: ${foundResult.email}`;
      $('#result').html(msg);

      // Trigger click event on the corresponding table row
      var selectedRow = $('#polygonTable tbody tr:contains("' + foundResult.name + '")');
      if (selectedRow.length) {
        selectedRow.click();
        // Scroll the table to bring the selected row into view
        selectedRow[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  } else {
      $('#result').html('H επιλεγμένη τοποθεσία δεν ανήκει σε κάποιο σχολείο...');
  }
}

function shortenAddress(data) {
  let parts = [];
  if (data.address.road) parts.push(data.address.road);
  if (data.address.postcode) parts.push(data.address.postcode);
  if (data.address.city) parts.push(data.address.city);
  return parts.join(', ');
}

// Event listener for map click
map.on('click', function(e) {
    var latlng = e.latlng;
    $.getJSON(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1`, function(data) {
      var address = shortenAddress(data);
      var popupContent = `Επιλεγμένη διεύθυνση: ${address}`;
      if (marker) {
        marker.setLatLng(latlng).setPopupContent(popupContent).openPopup();
      } else {
        marker = L.marker(latlng).bindPopup(popupContent).addTo(map).openPopup();
      }
      // Reset the address input
      addressInput.val(null).trigger('change');
    });

    checkPolygon(e.latlng);
});

addressInput.on('select2:select', function(e) {
  var data = e.params.data;
  var latlng = L.latLng(data.lat, data.lon);
  map.setView(latlng, 18);
  checkPolygon(latlng);
  if (marker) map.removeLayer(marker);
  marker = L.marker(latlng).bindPopup(data.text).addTo(map).openPopup();
});

// Load polygons when the page loads
$(document).ready(addPolygons);