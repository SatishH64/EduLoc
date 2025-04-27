document.addEventListener("DOMContentLoaded", () => {

    const bookSearchForm = document.getElementById("book-search-form");
    const bookResults = document.getElementById("book-results");
    const favoriteToggleBtn = document.getElementById('favorite-toggle');

    if (favoriteToggleBtn) {
        favoriteToggleBtn.addEventListener('click', function() {
            const libraryId = this.getAttribute('data-library-id');
            const libraryName = this.getAttribute('data-library-name');
            const libraryAddress = this.getAttribute('data-library-address');

            console.log("Toggling favorite for:", {
                libraryId,
                libraryName,
                libraryAddress
            });

            // Get CSRF token from cookie
            const csrfToken = getCookie('csrftoken');

            // Use fetch with the correct content type and format
            fetch('/api/toggle-favorite-library/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRFToken': csrfToken
                },
                body: `library_id=${encodeURIComponent(libraryId)}&library_name=${encodeURIComponent(libraryName)}&library_address=${encodeURIComponent(libraryAddress)}`
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'added') {
                    // Update button to show "favorited" state
                    favoriteToggleBtn.classList.remove('btn-outline-primary');
                    favoriteToggleBtn.classList.add('btn-success');
                    favoriteToggleBtn.innerHTML = '<i class="bi bi-heart-fill"></i> Favorited';
                } else if (data.status === 'removed') {
                    // Update button to show "add to favorites" state
                    favoriteToggleBtn.classList.remove('btn-success');
                    favoriteToggleBtn.classList.add('btn-outline-primary');
                    favoriteToggleBtn.innerHTML = '<i class="bi bi-heart"></i> Add to Favorites';
                }

                // Show notification (optional)
                alert(data.message);
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred while updating favorites');
            });
        });
    }


    // Handle book search (if the form exists)
    if (bookSearchForm) {
        bookSearchForm.addEventListener("submit", (event) => {
            event.preventDefault();

            // Check if elements exist before trying to access their values
            const titleElement = document.getElementById("book-title");
            const authorElement = document.getElementById("book-author");

            const title = titleElement ? titleElement.value.trim() : '';
            const author = authorElement ? authorElement.value.trim() : '';

            if (!title && !author) {
                alert("Please enter a book title or author name");
                return;
            }

            let queryParams = [];
            if (title) {
                queryParams.push(`title=${encodeURIComponent(title)}`);
            }
            if (author) {
                queryParams.push(`author=${encodeURIComponent(author)}`);
            }
            const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";

            // Display loading indicator
            if (bookResults) {
                bookResults.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
            }

            fetch(`/api/search-books/${queryString}`)
                .then(response => response.json())
                .then(data => {
                    if (!bookResults) return;

                    bookResults.innerHTML = "";

                    if (!data.books || data.books.length === 0) {
                        bookResults.innerHTML = "<p>No books found.</p>";
                        return;
                    }

                    data.books.forEach(book => {
                        const div = document.createElement("div");
                        div.className = "card mb-3";
                        div.innerHTML = `
                            <div class="card-body">
                                ${book.cover_url ? `<img src="${book.cover_url}" alt="" style="width: 100%; height: auto; object-fit: contain;">` : ''}
                                <h5 class="card-title">${book.title}</h5>
                                <p class="card-text">Author: ${book.author}</p>
                                <p class="card-text">Published: ${book.first_publish_year || "Unknown"}</p>
                            </div>
                        `;
                        bookResults.appendChild(div);
                    });

                })
                .catch(error => {
                    console.error("Error searching for books:", error);
                    if (bookResults) {
                        bookResults.innerHTML = "<p>Error loading books. Please try again.</p>";
                    }
                });
        });
    }

    // Helper function to get CSRF token from cookies
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

});