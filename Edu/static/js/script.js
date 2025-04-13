let map;
let markers = [];
let currentInfoWindow = null;
let currentPosition = null;

function initMap() {
    // Default center (can be anywhere, user will search or use location)
    const defaultCenter = {lat: 37.7749, lng: -122.4194}; // San Francisco

    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultCenter,
        zoom: 12,
        // mapTypeControl: true,
        disableDefaultUI: true,
        fullscreenControl: true,
    });

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setCenter(userLocation);
                setCurrentPosition(userLocation);
            },
            () => {
                console.log("Error: The Geolocation service failed.");
            }
        );
    }

    // Allow clicking on map to place marker
    map.addListener("click", (event) => {
        setCurrentPosition({
            lat: event.latLng.lat(),
            lng: event.latLng.lng()
        });
    });

    // Search button click handler
    document.getElementById("search-button").addEventListener("click", () => {
        const searchText = document.getElementById("location-search").value;
        if (searchText.trim() === "") return;

        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({address: searchText}, (results, status) => {
            if (status === "OK" && results[0]) {
                const location = results[0].geometry.location;
                map.setCenter(location);
                setCurrentPosition({
                    lat: location.lat(),
                    lng: location.lng()
                });
            } else {
                alert("Location not found. Please try a different search term.");
            }
        });
    });

    // Filter change events
    document.getElementById("library-filter").addEventListener("change", fetchResources);
    document.getElementById("event-filter").addEventListener("change", fetchResources);
    document.getElementById("radius-select").addEventListener("change", fetchResources);
}

let searchCircle = null;

function addCircleToMap(center, radius) {
    // Ensure radius is a number
    radius = parseFloat(radius);
    if (isNaN(radius)) {
        console.error("Invalid radius value:", radius);
        return;
    }

    // Ensure center is a valid LatLng object
    if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") {
        console.error("Invalid center value:", center);
        return;
    }

    // Clear any existing circle
    if (searchCircle) {
        searchCircle.setMap(null);
    }

    // Create a new circle
    searchCircle = new google.maps.Circle({
        map: map,
        center: center,
        radius: radius, // Radius in meters
        fillColor: '#ADD8E6',
        fillOpacity: 0.35,
        strokeColor: '#66b8fb',
        strokeOpacity: 0.8,
        strokeWeight: 2
    });

    // Adjust the map view to fit the circle
    map.fitBounds(searchCircle.getBounds());
}


function setCurrentPosition(position) {
    // Ensure position is valid
    if (!position || typeof position.lat !== "number" || typeof position.lng !== "number") {
        console.error("Invalid position value:", position);
        return;
    }

    // Clear all existing markers
    clearMarkers();

    const radius = parseFloat(document.getElementById("radius-select").value);
    if (isNaN(radius)) {
        console.error("Invalid radius value:", radius);
        return;
    }

    // Create marker at clicked position
    currentPosition = position;

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
        },
        animation: google.maps.Animation.DROP,
        title: "Selected Location"
    });

    markers.push(marker);

    // Fetch resources around this position
    fetchResources();
    addCircleToMap(position, radius);
}

function clearMarkers() {
    for (let marker of markers) {
        marker.setMap(null);
    }
    markers = [];
}

function fetchResources() {

    if (!currentPosition) return;

    const showLibraries = document.getElementById("library-filter").checked;
    const showEvents = document.getElementById("event-filter").checked;
    const radius = document.getElementById("radius-select").value;
    const startDate = new Date().toISOString().split('T')[0]; // Current date
    let endDate = null

    document.getElementById("libraries-list").innerHTML = "Loading...";
    document.getElementById("events-list").innerHTML = "Loading...";

    const location = `${currentPosition.lat},${currentPosition.lng}`;

    if (showLibraries) {
        // Fetch libraries
        fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=library`)
            .then(response => response.json())
            .then(data => {
                console.log(data);
                displayLibraries(data.places);
            })
            .catch(error => {
                console.error('Error fetching libraries:', error);
                document.getElementById("libraries-list").innerHTML = "<p>Error loading libraries</p>";
            });
    } else {
        document.getElementById("libraries-list").innerHTML = "<p>Libraries filter is turned off</p>";
    }
    console.log(startDate, endDate);
    if (showEvents) {
        // Fetch events
        fetch(`/api/events/education/?location=${location}&radius=${radius}&start=${startDate}&end=${endDate}`)
            .then(response => response.json())
            .then(data => {
                displayEvents(data);

            })
            .catch(error => {
                console.error('Error fetching events:', error);
                document.getElementById("events-list").innerHTML = "<p>Error loading events</p>";
            });
    } else {
        document.getElementById("events-list").innerHTML = "<p>Events filter is turned off</p>";
    }
}


function displayLibraries(places) {
    if (!places || places.length === 0) {
        document.getElementById("libraries-list").innerHTML = "<p>No libraries found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("library-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.geometry.location.lat,
                    lng: place.geometry.location.lng
                },
                map: map,
                title: place.name,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<div><h5>${place.name}</h5><p>${place.vicinity}</p></div>`
            });

            marker.addListener("click", () => {
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                infoWindow.open(map, marker);
                currentInfoWindow = infoWindow;

                // Get more details
                fetch(`/api/place-details/?placeId=${place.place_id}`)
                    .then(response => response.json())
                    .then(data => {
                        const result = data.result || {};
                        let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

                        if (result.formatted_phone_number) {
                            content += `<p>Phone: ${result.formatted_phone_number}</p>`;
                        }

                        if (result.website) {
                            content += `<p><a href="${result.website}" target="_blank">Website</a></p>`;
                        }

                        content += '</div>';
                        infoWindow.setContent(content);
                    });
            });

            markers.push(marker);
        }

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                </div>`;
    });

    document.getElementById("libraries-list").innerHTML = html;
}

function displayEvents(events) {
    console.log(events);

    if (!events || events.length === 0) {
        document.getElementById("events-list").innerHTML = "<p>No educational events found in this area</p>";
        return;
    }

    let html = '';

    events.forEach(event => {
        // Add marker to map

        if (document.getElementById("event-filter").checked && event.location) {
            const marker = new google.maps.Marker({
                position: {
                    lat: event.location[1],
                    lng: event.location[0]
                },
                map: map,
                title: event.title,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }
            });

            const startDate = new Date(event.start).toLocaleDateString();
            const endDate = new Date(event.end).toLocaleDateString();

            const infoWindow = new google.maps.InfoWindow({
                content: `<div>
                            <h5>${event.title}</h5>
                            <p>From: ${startDate} to ${endDate}</p>
                            <p>Category: ${event.category}</p>
                            ${event.description ? `<p>${event.description}</p>` : ''}
                        </div>`
            });

            marker.addListener("click", () => {
                if (currentInfoWindow) {
                    currentInfoWindow.close();
                }
                infoWindow.open(map, marker);
                currentInfoWindow = infoWindow;
            });

            markers.push(marker);
        }

        // Format dates
        const startDate = new Date(event.start).toLocaleDateString();
        const endDate = new Date(event.end).toLocaleDateString();

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${event.title}</h5>
                    <p>From: ${startDate} to ${endDate}</p>
                    <div>
                        <span class="badge bg-primary">${event.category}</span>
                    </div>
                    ${event.description ? `<p class="mt-2">${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}</p>` : ''}
                </div>`;
    });

    document.getElementById("events-list").innerHTML = html;
}

// Allow pressing Enter in the search box
document.getElementById("location-search").addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
        document.getElementById("search-button").click();
    }
});
