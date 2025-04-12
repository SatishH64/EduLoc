document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("book-search-form");
    if (form) {
        form.addEventListener("submit", handleBookSearch);
    }
});

// function handleBookSearch(event) {
//     event.preventDefault();
//
//     const input = document.getElementById("book-search-input");
//     const searchBy = document.getElementById("search-by");
//
//     if (!input || !searchBy) return;
//
//     const queryValue = input.value.trim();
//     const queryType = searchBy.value.trim(); // 'author' or 'title'
//
//     if (queryValue && (queryType === "author" || queryType === "title")) {
//         const params = new URLSearchParams();
//         params.append(queryType, queryValue);
//         fetch(`/api/search-books/?${params.toString()}`)
//             .then(response => response.json())
//             .then(data => {
//                 if (data?.books) {
//                     displayBookCovers(data.books);
//                 } else {
//                     throw new Error("No valid book data returned");
//                 }
//             })
//             .catch(error => {
//                 console.error("Error:", error);
//                 const container = document.getElementById("book-covers-container");
//                 if (container) {
//                     container.innerHTML = "<p>Error loading book covers</p>";
//                 }
//             });
//     }
// }

function handleBookSearch(event) {
    event.preventDefault();

    const input = document.getElementById("book-search-input");
    const searchBy = document.getElementById("search-by");
    const spinner = document.getElementById("loading-spinner");

    if (!input || !searchBy) return;

    const queryValue = input.value.trim();
    const queryType = searchBy.value.trim(); // 'author' or 'title'

    if (queryValue && (queryType === "author" || queryType === "title")) {
        const params = new URLSearchParams();
        params.append(queryType, queryValue);

        // 🔄 Show spinner
        if (spinner) spinner.style.display = "block";

        fetch(`/api/search-books/?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                if (data?.books) {
                    displayBookCovers(data.books);
                } else {
                    throw new Error("No valid book data returned");
                }
            })
            .catch(error => {
                console.error("Error:", error);
                const container = document.getElementById("book-covers-container");
                if (container) {
                    container.innerHTML = "<p>Error loading book covers</p>";
                }
            })
            .finally(() => {
                // ✅ Hide spinner after fetch completes
                if (spinner) spinner.style.display = "none";
            });
    }
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

        const title = escapeHtml(book.title || "Untitled");
        const author = escapeHtml(book.author || "Unknown Author");
        const coverUrl = book.cover_url || "https://via.placeholder.com/150x200?text=No+Cover";

        card.innerHTML =
            `<div class="card h-100">
                <img src="${coverUrl}" class="card-img-top" alt="${title}">
                <div class="card-body">
                    <h6 class="card-title">${title}</h6>
                    <p class="card-text"><small>${author}</small></p>
                </div>
            </div>`
        ;
        container.appendChild(card);
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
