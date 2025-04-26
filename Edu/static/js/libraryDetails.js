document.addEventListener("DOMContentLoaded", () => {
    const libraryName = document.getElementById("library-name");
    const libraryAddress = document.getElementById("library-address");
    const libraryFacilities = document.getElementById("library-facilities");
    const bookSearchForm = document.getElementById("book-search-form");
    const bookResults = document.getElementById("book-results");

    // Fetch library details from the server
    // const urlParams = new URLSearchParams(window.location.search);
    // const libraryId = urlParams.get("id");
    // fetch('/api/library-details/${libraryId}/');
    // fetch(`/api/library-details/?library_id=${libraryId}`)
    //     .then(response => response.json())
    //     .then(data => {
    //         libraryName.textContent = data.name;
    //         libraryAddress.textContent = data.address;
    //
    //         // data.facilities.forEach(facility => {
    //         //     const li = document.createElement("li");
    //         //     li.className = "list-group-item";
    //         //     li.textContent = facility;
    //         //     libraryFacilities.appendChild(li);
    //         // });
    //     })
    //     .catch(error => {
    //         console.error("Error fetching library details:", error);
    //     });

    // Handle book search
    bookSearchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = document.getElementById("book-title").value.trim();
        const author = document.getElementById("book-author").value.trim();

        let queryParams = [];
        if (title) {
            queryParams.push(`title=${encodeURIComponent(title)}`);
            }
        if (author) {
            queryParams.push(`author=${encodeURIComponent(author)}`);
        }
        const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";

        fetch(`/api/search-books/${queryString}`)
            .then(response => response.json())
            .then(data => {
                bookResults.innerHTML = "";

                if (data.books.length === 0) {
                    bookResults.innerHTML = "<p>No books found.</p>";
                    return;
                }

                data.books.forEach(book => {
                    const div = document.createElement("div");
                    div.className = "card mb-3";
                    div.innerHTML = `
                        <div class="card-body">
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
            });
    });
});