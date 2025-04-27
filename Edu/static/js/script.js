// Cache implementation
const appCache = {
    // Initialize cache
    init: function() {
        this.cachePrefix = 'edu_loc_cache_';
        this.defaultExpiry = 30; // minutes

        // Add cache controls to UI
        this.addCacheControls();

        console.log('Cache system initialized');
        return this;
    },

    // Generate a cache key
    key: function(type, params) {
        return this.cachePrefix + type + '_' + JSON.stringify(params);
    },

    // Set item in cache
    set: function(type, params, data, expiryMinutes = this.defaultExpiry) {
        const key = this.key(type, params);
        const item = {
            data: data,
            timestamp: new Date().getTime(),
            expiry: new Date().getTime() + (expiryMinutes * 60 * 1000)
        };

        try {
            localStorage.setItem(key, JSON.stringify(item));
            // console.log(`Cached: ${key} (expires in ${expiryMinutes} min)`);
            return true;
        } catch (e) {
            console.error('Cache error:', e);
            // If the cache is full, clear older items
            this.pruneCache();
            try {
                localStorage.setItem(key, JSON.stringify(item));
                return true;
            } catch (e) {
                console.error('Cache still failed after pruning:', e);
                return false;
            }
        }
    },

    // Get item from cache
    get: function(type, params) {
        const key = this.key(type, params);
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;

            const parsedItem = JSON.parse(item);
            const now = new Date().getTime();

            // Check if item is expired
            if (now > parsedItem.expiry) {
                console.log(`Cache expired: ${key}`);
                this.remove(key);
                return null;
            }

            console.log(`Cache hit: ${key}`);
            return parsedItem.data;
        } catch (e) {
            console.error('Cache retrieval error:', e);
            return null;
        }
    },

    // Remove item from cache
    remove: function(key) {
        if (key.startsWith(this.cachePrefix)) {
            localStorage.removeItem(key);
        } else {
            localStorage.removeItem(this.cachePrefix + key);
        }
    },

    // Clear all cache
    clear: function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                keys.push(key);
            }
        }

        keys.forEach(key => localStorage.removeItem(key));
        console.log(`Cleared ${keys.length} items from cache`);

        // Refresh all data
        if (currentPosition) {
            fetchResources();
        }

        return keys.length;
    },

    // Remove oldest items to make space
    pruneCache: function() {
        const cacheItems = [];
        // Get all cache items
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                try {
                    const item = JSON.parse(localStorage.getItem(key));
                    cacheItems.push({
                        key: key,
                        timestamp: item.timestamp
                    });
                } catch (e) {
                    // If item is corrupt, remove it
                    localStorage.removeItem(key);
                }
            }
        }

        // Sort by age (oldest first)
        cacheItems.sort((a, b) => a.timestamp - b.timestamp);

        // Remove oldest 30% of items
        const itemsToRemove = Math.ceil(cacheItems.length * 0.3);
        for (let i = 0; i < itemsToRemove; i++) {
            if (cacheItems[i]) {
                localStorage.removeItem(cacheItems[i].key);
            }
        }

        console.log(`Pruned ${itemsToRemove} old cache items`);
    },

    // Add cache control UI
    addCacheControls: function() {
        // Add a button to clear cache
        document.addEventListener('DOMContentLoaded', () => {
            const container = document.querySelector('.map-controls') || document.body;

            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'btn btn-sm btn-warning clear-cache-btn';
            refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Data';
            refreshBtn.style.position = 'fixed';
            refreshBtn.style.bottom = '20px';
            refreshBtn.style.right = '20px';
            refreshBtn.style.zIndex = '1000';

            refreshBtn.addEventListener('click', () => {
                const count = this.clear();
                alert(`Cleared ${count} cached items. Data refreshed!`);
            });

            container.appendChild(refreshBtn);
        });
    }
};

// Initialize cache
const cache = appCache.init();

// Initialize map and other variables
let map;
let markers = [];
let currentInfoWindow = null;
let currentPosition = null;

function initMap() {
    // Default center (can be anywhere, user will search or use location)
    const defaultCenter = {lat: 37.7749, lng: -122.4194}; // San Francisco

    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultCenter, zoom: 12, mapTypeControl: true, // disableDefaultUI: true,
        // fullscreenControl: true,
    });

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLocation = {
                lat: position.coords.latitude, lng: position.coords.longitude
            };
            map.setCenter(userLocation);
            setCurrentPosition(userLocation);
        }, () => {
            console.log("Error: The Geolocation service failed.");
        });
    }

    // Allow clicking on map to place marker
    map.addListener("click", (event) => {
        setCurrentPosition({
            lat: event.latLng.lat(), lng: event.latLng.lng()
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
                    lat: location.lat(), lng: location.lng()
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
        map: map, center: center, radius: radius, // Radius in meters
        fillColor: '#ADD8E6', fillOpacity: 0.35, strokeColor: '#66b8fb', strokeOpacity: 0.8, strokeWeight: 2
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
        position: position, map: map, icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
        }, animation: google.maps.Animation.DROP, title: "Selected Location"
    });

    markers.push(marker);

    // Fetch resources around this position
    fetchResources();
    addCircleToMap(position, radius);

    // Get the radius slider element
    const radiusSelect = document.getElementById('radius-select');

// Add an event listener to dynamically update the circle's radius
    // Add an event listener to dynamically update the circle's radius with animation
    radiusSelect.addEventListener('input', () => {
        const newRadius = parseFloat(radiusSelect.value); // Get the new radius value
        if (searchCircle) {
            animateRadiusChange(searchCircle, newRadius); // Call the animation function
            clearMarkers();
        }
    });

}

// Function to animate the radius change
function animateRadiusChange(circle, newRadius) {
    const currentRadius = circle.getRadius();
    const steps = 20; // Number of steps for the animation
    const stepDuration = 10; // Duration of each step in milliseconds
    const radiusStep = (newRadius - currentRadius) / steps;

    let currentStep = 0;

    const interval = setInterval(() => {
        currentStep++;
        const updatedRadius = currentRadius + radiusStep * currentStep;
        circle.setRadius(updatedRadius);

        if (currentStep >= steps) {
            clearInterval(interval); // Stop the animation when done
        }
    }, stepDuration);
}

// Ensure radiusSelect is defined
const radiusSelect = document.getElementById('radius-select');

if (radiusSelect) {
    // Add an event listener to dynamically update the circle's radius with animation
    radiusSelect.addEventListener('input', () => {
        const newRadius = parseFloat(radiusSelect.value); // Get the new radius value
        if (searchCircle) {
            animateRadiusChange(searchCircle, newRadius); // Animate the radius change
        }
    });
} else {
    console.error("Element with ID 'radius-select' not found.");
}

function clearMarkers() {
    for (let marker of markers) {
        marker.setMap(null);
    }
    markers = [];
}


// fetchResources function to fetch data from the server
function fetchResources() {
    if (!currentPosition) return;

    const showLibraries = document.getElementById("library-filter").checked;
    const showUniversities = document.getElementById("universities-filter").checked;
    const showSchools = document.getElementById("schools-filter").checked;
    const showEvents = document.getElementById("event-filter").checked;
    const showPrimarySchools = document.getElementById("primary-schools-filter").checked;
    const showSecondarySchools = document.getElementById("secondary-schools-filter").checked;
    const showBookStores = document.getElementById("bookstores-filter").checked;
    const radius = document.getElementById("radius-select").value;
    const startDate = new Date().toISOString().split('T')[0]; // Current date
    let endDate = null;

    document.getElementById("libraries-list").innerHTML = "Loading...";
    document.getElementById("events-list").innerHTML = "Loading...";
    document.getElementById("schools-list").innerHTML = "Loading...";
    document.getElementById("universities-list").innerHTML = "Loading...";

    const location = `${currentPosition.lat},${currentPosition.lng}`;

    if (showLibraries) {
        // Check cache first
        const cacheParams = { location, radius, type: 'library' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displayLibraries(cachedData);
        } else {
            // Fetch from server
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=library`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    // Cache the data for 30 minutes
                    cache.set('places', cacheParams, data.places, 30);
                    displayLibraries(data.places);
                })
                .catch(error => {
                    console.error('Error fetching libraries:', error);
                    document.getElementById("libraries-list").innerHTML = "<p>Error loading libraries</p>";
                });
        }
    } else {
        document.getElementById("libraries-list").innerHTML = "<p>Libraries filter is turned off</p>";
    }

    if (showUniversities) {
        const cacheParams = { location, radius, type: 'university' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displayUniversities(cachedData);
        } else {
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=university`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    cache.set('places', cacheParams, data.places, 30);
                    displayUniversities(data.places);
                })
                .catch(error => {
                    console.error('Error fetching Universities:', error);
                    document.getElementById("universities-list").innerHTML = "<p>Error loading Universities</p>";
                });
        }
    } else {
        document.getElementById("universities-list").innerHTML = "<p>Universities filter is turned off</p>";
    }
    if (showSchools) {
        const cacheParams = { location, radius, type: 'school' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displaySchools(cachedData);
        } else {
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=school`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    cache.set('places', cacheParams, data.places, 30);
                    displaySchools(data.places);
                })
                .catch(error => {
                    console.error('Error fetching Schools:', error);
                    document.getElementById("schools-list").innerHTML = "<p>Error loading Schools</p>";
                });
        }
    } else {
        document.getElementById("schools-list").innerHTML = "<p>Schools filter is turned off</p>";
    }

    if (showEvents) {
        const cacheParams = { location, radius, startDate };
        const cachedData = cache.get('events', cacheParams);

        if (cachedData) {
            displayEvents(cachedData);
        } else {
            fetch(`/api/events/education/?location=${location}&radius=${radius}&start=${startDate}&end=${endDate}`)
                .then(response => response.json())
                .then(data => {
                    // Cache for 1 hour (events are more dynamic)
                    cache.set('events', cacheParams, data, 60);
                    displayEvents(data);
                })
                .catch(error => {
                    console.error('Error fetching events:', error);
                    document.getElementById("events-list").innerHTML = "<p>Error loading events</p>";
                });
        }
    } else {
        document.getElementById("events-list").innerHTML = "<p>Events filter is turned off</p>";
    }

    if (showPrimarySchools) {
        const cacheParams = { location, radius, type: 'primary_school' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displayPrimarySchools(cachedData);
        } else {
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=primary_school`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    cache.set('places', cacheParams, data.places, 30);
                    displayPrimarySchools(data.places);
                })
                .catch(error => {
                    console.error('Error fetching Primary Schools:', error);
                    document.getElementById("primary-schools-list").innerHTML = "<p>Error loading Primary Schools</p>";
                });
        }
    } else {
        document.getElementById("primary-schools-list").innerHTML = "<p>Primary Schools filter is turned off</p>";
    }

    if (showSecondarySchools) {
        const cacheParams = { location, radius, type: 'secondary_school' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displaySecondarySchools(cachedData);
        } else {
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=secondary_school`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    cache.set('places', cacheParams, data.places, 30);
                    displaySecondarySchools(data.places);
                })
                .catch(error => {
                    console.error('Error fetching Secondary Schools:', error);
                    document.getElementById("secondary-schools-list").innerHTML = "<p>Error loading Secondary Schools</p>";
                });
        }
    } else {
        document.getElementById("secondary-schools-list").innerHTML = "<p>Secondary Schools filter is turned off</p>";
    }

    if (showBookStores) {
        const cacheParams = { location, radius, type: 'book_store' };
        const cachedData = cache.get('places', cacheParams);

        if (cachedData) {
            displayBookStores(cachedData);
        } else {
            fetch(`/api/nearby-search/?location=${location}&radius=${radius}&type=book_store`)
                .then(response => response.json())
                .then(data => {
                    // console.log(data);
                    cache.set('places', cacheParams, data.places, 30);
                    displayBookStores(data.places);
                })
                .catch(error => {
                    console.error('Error fetching Book Stores:', error);
                    document.getElementById("bookstores-list").innerHTML = "<p>Error loading Book Stores</p>";
                });
        }
    } else {
        document.getElementById("bookstores-list").innerHTML = "<p>Book Stores filter is turned off</p>";
    }

}

// Function to display libraries
function displayLibraries(places) {
    if (!places || places.length === 0) {
        document.getElementById("libraries-list").innerHTML = "<p>No libraries found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        if (document.getElementById("library-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                },
                map: map,
                title: place.name,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                }
            });

            //Info window content with already available data
            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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
        // console.log(place.place_id);
        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="/api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });

    document.getElementById("libraries-list").innerHTML = html;
}

function displayEvents(events) {
    if (!events || events.length === 0) {
        document.getElementById("events-list").innerHTML = "<p>No educational events found in this area</p>";
        return;
    }

    let html = '';

    // console.log(document.getElementById("event-filter").checked)

    events.forEach(eve => {
        // Ensure event has valid latitude and longitude
        // console.log(eve);
        if (typeof eve.latitude !== "number" || typeof eve.longitude !== "number") {
            console.error("Invalid event location:", eve);
        }
        if (document.getElementById("event-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: eve.latitude,
                    lng: eve.longitude,
                },
                map: map,
                title: eve.title,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }
            });
            // console.log(marker.map)
            const startDate = new Date(eve.start).toLocaleDateString();
            const endDate = new Date(eve.end).toLocaleDateString();

            const infoWindow = new google.maps.InfoWindow({
                content: `<div>
                            <h5>${eve.title}</h5>
                            <p>From: ${startDate} to ${endDate}</p>
                            <p>Category: ${eve.category}</p>
                            ${eve.description ? `<p>${eve.description}</p>` : ''}
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
        const startDate = new Date(eve.start).toLocaleDateString();
        const endDate = new Date(eve.end).toLocaleDateString();

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${eve.title}</h5>
                    <p>From: ${startDate} to ${endDate}</p>
                    <div>
                        <span class="badge bg-primary">${eve.category}</span>
                    </div>
                    ${eve.description ? `<p class="mt-2">${eve.description.substring(0, 100)}${eve.description.length > 100 ? '...' : ''}</p>` : ''}
                </div>`;
    });

    document.getElementById("events-list").innerHTML = html;
}

function displayUniversities(places) {
    if (!places || places.length === 0) {
        document.getElementById("universities-list").innerHTML = "<p>No libraries found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("universities-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                }, map: map, title: place.name, icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png"
                }
            });

            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });


    document.getElementById("universities-list").innerHTML = html;
}

function displaySchools(places) {
    if (!places || places.length === 0) {
        document.getElementById("schools-list").innerHTML = "<p>No schools found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("schools-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                }, map: map, title: place.name, icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png"
                }
            });

            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });


    document.getElementById("schools-list").innerHTML = html;
}

function displayPrimarySchools(places) {
    if (!places || places.length === 0) {
        document.getElementById("primary-schools-list").innerHTML = "<p>No schools found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("primary-schools-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                }, map: map, title: place.name, icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                }
            });
            // console.log(place);
            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });


    document.getElementById("primary-schools-list").innerHTML = html;
}

function displaySecondarySchools(places) {
    if (!places || places.length === 0) {
        document.getElementById("secondary-schools-list").innerHTML = "<p>No schools found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("secondary-schools-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                }, map: map, title: place.name, icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                }
            });

            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });


    document.getElementById("secondary-schools-list").innerHTML = html;
}

function displayBookStores(places) {
    if (!places || places.length === 0) {
        document.getElementById("book-stores-list").innerHTML = "<p>No schools found in this area</p>";
        return;
    }

    let html = '';

    places.forEach(place => {
        // Add marker to map
        if (document.getElementById("bookstores-filter").checked) {
            const marker = new google.maps.Marker({
                position: {
                    lat: place.latitude, lng: place.longitude,
                }, map: map, title: place.name, icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png"
                }
            });

            let content = `<div><h5>${place.name}</h5><p>${place.vicinity}</p>`;

            if (place.phone_number) {
                content += `<p>Phone: ${place.phone_number}</p>`;
            }

            if (place.website) {
                content += `<p><a href="${place.website}" target="_blank">Website</a></p>`;
            }

            content += '</div>';

            const infoWindow = new google.maps.InfoWindow({
                content: content
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

        // Add to list
        html += `
                <div class="resource-item">
                    <h5>${place.name}</h5>
                    <p>${place.vicinity}</p>
                    <div>
                        <span class="badge bg-info">${place.rating ? place.rating + '★' : 'No rating'}</span>
                        ${place.open_now ? '<span class="badge bg-success">Open Now</span>' : ''}
                    </div>
                    <div>
                        <a href="api/library-details/${place.place_id}" class="btn btn-primary btn-sm">View Details</a>
                    </div>
                </div>`;
    });


    document.getElementById("book-stores-list").innerHTML = html;
}

// Allow pressing Enter in the search box
document.getElementById("location-search").addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
        document.getElementById("search-button").click();
    }
});

