let map;
let markers = [];
let currentInfoWindow = null;
let currentPosition = null;

function initMap() {
    // Default center (can be anywhere, user will search or use location)
    const defaultCenter = {lat: 37.7749, lng: -122.4194}; // San Francisco
    // let radius = document.getElementById("radius-select").value;
    // console.log(radius)
    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultCenter,
        zoom: 12,
        mapTypeControl: true,
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
                addCircleToMap(userLocation, 1500);
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
        fetchResource().then(() => {
            addCircleToMap({
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            }, 1500);
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
                addCircleToMap({
                    lat: location.lat(),
                    lng: location.lng()
                }, 1500);
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
    // Clear all existing markers
    clearMarkers();

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
    const endDate = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0];

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

    if (showEvents) {
        // Fetch events
        fetch(`/api/events/education/?lat=${location[0]}&lon=${location[1]}&radius=${radius}&q=education&start=${startDate}&end=${endDate}`)
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

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("book-search-form");
    if (form) {
        form.addEventListener("submit", handleBookSearch);
    }
});

function handleBookSearch(event) {
    event.preventDefault();
    const input = document.getElementById("book-search-input");
    if (!input) return;

    const query = input.value.trim();
    if (query) {
        fetchBookCovers(query);
    }
}

function fetchBookCovers(query) {
    const params = new URLSearchParams();

    // Support "title:Harry Potter" or "author:J.K. Rowling" or generic
    const parts = query.split(":");
    if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(":").trim();

        if (key === "title" || key === "author") {
            params.append(key, value);
        } else {
            params.append("title", query);
        }
    } else {
        params.append("title", query); // fallback
    }

    fetch(`/api/search-books/?${params.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data?.books) {
                displayBookCovers(data.books);
            } else {
                throw new Error("Invalid response format");
            }
        })
        .catch(error => {
            console.error("Error fetching book covers:", error);
            const container = document.getElementById("book-covers-container");
            if (container) {
                container.innerHTML = "<p>Error loading book covers</p>";
            }
        });
}

function displayBookCovers(books) {
    const container = document.getElementById("book-covers-container");
    if (!container) return;

    container.innerHTML = "";

    if (!books.length) {
        container.innerHTML = "<p>No books found</p>";
        return;
    }

    books.forEach(book => {
        const card = document.createElement("div");
        card.className = "col-md-3 mb-3";

        const title = book.title || "Untitled";
        const author = book.author || "Unknown Author";
        const coverUrl = book.cover_url || "https://via.placeholder.com/150x200?text=No+Cover";

        card.innerHTML = `
            <div class="card h-100">
                <img src="${coverUrl}" class="card-img-top" alt="${title}">
                <div class="card-body">
                    <h6 class="card-title">${escapeHtml(title)}</h6>
                    <p class="card-text"><small>${escapeHtml(author)}</small></p>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}
