/*
  SmartChat frontend interactions.
  The default chat/upload/delete API URLs are examples. Update them to match main.py.
*/


let queryCount = 0;
let activity = ["SmartChat workspace opened."];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fileKind(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { icon: "bi-file-earmark-pdf-fill", className: "" };
  if (["doc", "docx"].includes(ext)) return { icon: "bi-file-earmark-word-fill", className: "doc" };
  if (["txt", "md", "csv", "xlsx", "xls"].includes(ext)) return { icon: "bi-file-earmark-spreadsheet-fill", className: "txt" };
  return { icon: "bi-file-earmark-fill", className: "other" };
}
function showToast(message) {
  $("#toastMessage").textContent = message;
  bootstrap.Toast.getOrCreateInstance($("#appToast"), { delay: 3200 }).show();
}
function logActivity(message) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  activity.unshift(`${time} — ${message}`);
  $("#activityLog").innerHTML = activity.map(item => `<div class="log-entry">${escapeHTML(item)}</div>`).join("");
  $("#lastActivity").textContent = "Just now";
}
function switchView(view) {
  const panelMap = {
    home: null, upload: "uploadPanel", documents: "documentsPanel", delete: "deletePanel",
    admin: "adminPanel", users: "usersPanel", settings: "settingsPanel", logs: "logsPanel"
  };
  $$(".content-panel").forEach(panel => panel.classList.add("d-none"));
  $("#chatSection").classList.toggle("d-none", view !== "home");
  $("#chatSection").classList.toggle("d-none", view !== "home");
  const panelId = panelMap[view];
  if (panelId) $(`#${panelId}`).classList.remove("d-none");
  $$(".sidebar-nav .nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === view || (view === "users" || view === "settings" || view === "logs") && link.dataset.view === "admin"));
 
  if (view === "delete") renderDeleteList();
  closeSidebar();
  if (view === "home") $("#questionInput").focus({ preventScroll: true });
}
function openSidebar() {
  $("#sidebar").classList.add("open");
  $("#sidebarBackdrop").classList.add("show");
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebarBackdrop").classList.remove("show");
}



function addMessage(text, who = "assistant", timeLabel = null) {
  const row = document.createElement("div");
  row.className = `message-row ${who === "user" ? "user-row" : "assistant-row"}`;
  const avatar = who === "user" ? "" : '<div class="message-avatar"><i class="bi bi-stars"></i></div>';
  const bubbleClass = who === "user" ? "user-bubble" : "assistant-bubble";
  const time = timeLabel || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  row.innerHTML = `${avatar}<div class="message-bubble ${bubbleClass}"><p></p><span class="message-time">${escapeHTML(time)}</span></div>`;
  row.querySelector(".message-bubble p").textContent = text;
  $("#suggestions").classList.add("d-none");
  $("#chatMessages").appendChild(row);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}
async function sendQuestion(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return;
  addMessage(cleanQuestion, "user");
  queryCount += 1;
  $("#queryCount").textContent = queryCount;
  logActivity("Asked a question.");
  $("#questionInput").value = "";
  $("#questionInput").style.height = "auto";
  const sendButton = $("#sendButton");
  sendButton.disabled = true;
  sendButton.innerHTML = '<span>Thinking...</span><i class="bi bi-hourglass-split"></i>';
  const loadingRow = document.createElement("div");
  loadingRow.className = "message-row assistant-row";
  loadingRow.innerHTML = '<div class="message-avatar"><i class="bi bi-stars"></i></div><div class="message-bubble assistant-bubble"><p class="loading-text">Searching your documents…</p></div>';
  $("#chatMessages").appendChild(loadingRow);
  try {
    let answer;
    if (DEMO_MODE) {
      await new Promise(resolve => setTimeout(resolve, 700));
      answer = "This is a demo response. Connect the chat form to your FastAPI/LangChain endpoint to receive answers based on your uploaded documents.";
    } else {
      const response = await fetch(API.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, session_id: "web-session", model: "gpt-4o-mini" })
      });
      if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
      const data = await response.json();
      answer = data.answer ?? data.response ?? data.message ?? JSON.stringify(data);
    }
    loadingRow.remove();
    addMessage(answer, "assistant");
  } catch (error) {
    loadingRow.remove();
    addMessage(`I couldn't reach the chatbot service. ${error.message}. Check your FastAPI endpoint and try again.`, "assistant");
  } finally {
    sendButton.disabled = false;
    sendButton.innerHTML = '<span>Send</span><i class="bi bi-send-fill"></i>';
    $("#questionInput").focus();
  }
}

async function fetchDocuments() {
  if (DEMO_MODE) { renderAllDocuments(); return; }
  try {
    const response = await fetch(API.documents);
    if (!response.ok) throw new Error("Could not load documents.");
    const data = await response.json();
    documents = (Array.isArray(data) ? data : data.documents || []).map((doc, index) => ({
      id: String(doc.id ?? doc.document_id ?? doc.filename ?? index),
      name: doc.name ?? doc.filename ?? "Untitled document",
      type: (doc.type ?? (doc.name || doc.filename || "").split(".").pop() ?? "FILE").toUpperCase(),
      date: doc.date ?? doc.uploaded_at ?? "—",
      size: doc.size ?? ""
    }));
    renderAllDocuments();
  } catch (error) {
    showToast(error.message);
  }
}
async function deleteDocument(id) {
  const doc = documents.find(item => String(item.id) === String(id));
  if (!doc) return;
  if (!window.confirm(`Delete "${doc.name}"? This action may not be reversible.`)) return;
  if (!DEMO_MODE) {
    try {
      const response = await fetch(API.deleteDocument(id), { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  documents = documents.filter(item => String(item.id) !== String(id));
  renderAllDocuments();
  logActivity(`Deleted ${doc.name}.`);
  showToast(`"${doc.name}" was removed${DEMO_MODE ? " from the demo list" : ""}.`);
}

document.addEventListener("click", (event) => {
  const viewLink = event.target.closest("[data-view]");
  if (viewLink) {
    event.preventDefault();
    switchView(viewLink.dataset.view);
  }
  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) deleteDocument(deleteButton.dataset.deleteId);
  const suggestion = event.target.closest(".suggestion-chip");
  if (suggestion) sendQuestion(suggestion.textContent);
});
$("#menuToggle").addEventListener("click", openSidebar);
$("#sidebarClose").addEventListener("click", closeSidebar);
$("#sidebarBackdrop").addEventListener("click", closeSidebar);

$("#questionInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chatForm").requestSubmit();
  }
});
$("#questionInput").addEventListener("input", (event) => {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
});
$("#clearChat").addEventListener("click", () => {
  $("#chatMessages").innerHTML = `<div class="message-row assistant-row"><div class="message-avatar"><i class="bi bi-stars"></i></div><div class="message-bubble assistant-bubble"><p>New conversation started.</p><p>What would you like to know about your documents?</p><span class="message-time">Just now</span></div></div><div class="suggestion-wrap" id="suggestions"><button class="suggestion-chip">Summarise my documents</button><button class="suggestion-chip">What topics are covered?</button><button class="suggestion-chip">Find key recommendations</button></div>`;
  logActivity("Started a new chat.");
});
$("#documentFiles").addEventListener("change", (event) => {
  const files = [...event.target.files];
  $("#selectedFiles").innerHTML = files.map(file => `<div class="selected-file"><i class="bi bi-file-earmark-text text-warning"></i><span>${escapeHTML(file.name)}</span><span class="file-size">${formatSize(file.size)}</span></div>`).join("");
});

$("#refreshDocuments").addEventListener("click", fetchDocuments);
const dropZone = $("#dropZone");
["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", event => {
  const files = [...event.dataTransfer.files];
  const input = $("#documentFiles");
  try { input.files = event.dataTransfer.files; } catch (_) {}
  $("#selectedFiles").innerHTML = files.map(file => `<div class="selected-file"><i class="bi bi-file-earmark-text text-warning"></i><span>${escapeHTML(file.name)}</span><span class="file-size">${formatSize(file.size)}</span></div>`).join("");
});

$("#todayDate").textContent = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
$("#yearNow").textContent = new Date().getFullYear();


//For the list  document section
document.addEventListener("DOMContentLoaded", function () {

    const documentTableBody = document.getElementById("documentTableBody");
    const emptyDocuments = document.getElementById("emptyDocuments");
    const refreshButton = document.getElementById("refreshDocuments");

    // Fetch uploaded documents from FastAPI
    async function fetchDocuments() {

        documentTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">
                    Loading documents...
                </td>
            </tr>
        `;

        try {
            const response = await fetch("/list-docs", {
                method: "GET"
            });

            if (!response.ok) {
                throw new Error("Failed to fetch documents");
            }

            const documents = await response.json();

            documentTableBody.innerHTML = "";

            if (documents.length === 0) {
                emptyDocuments.classList.remove("d-none");
                return;
            }

            emptyDocuments.classList.add("d-none");

            documents.forEach((doc) => {

                // Get document filename
                const filename = doc.filename;

                // Extract file extension
                const fileType = filename.split(".").pop().toUpperCase();

                // Format date and time
                const dateAdded = doc.upload_timestamp
                    ? new Date(doc.upload_timestamp).toLocaleString()
                    : "N/A";

                // Create table row
                const row = document.createElement("tr");

                const filenameCell = document.createElement("td");
                filenameCell.textContent = filename;

                const typeCell = document.createElement("td");
                typeCell.textContent = fileType;

                const dateCell = document.createElement("td");
                dateCell.textContent = dateAdded;
                
                const actionCell = document.createElement("td");

            const deleteButton = document.createElement("button");

            deleteButton.className = "btn btn-sm btn-outline-danger";
            deleteButton.innerHTML = '<i class="bi bi-trash3"></i> Delete';

// Store the document's file_id in the button
            deleteButton.setAttribute("data-file-id", doc.id);

// Handle delete button click
    deleteButton.addEventListener("click", function () {
    const fileId = this.dataset.fileId;

    // Show the document name in the dialog
    document.getElementById("deleteDocumentName").textContent = doc.filename;

    // Store the selected ID on the confirmation button
    document.getElementById("confirmDeleteBtn").dataset.fileId = fileId;

    // Open the Bootstrap modal
    const modal = bootstrap.Modal.getOrCreateInstance(
        document.getElementById("deleteConfirmModal")
    );

    modal.show();
});

actionCell.appendChild(deleteButton);

                row.appendChild(filenameCell);
                row.appendChild(typeCell);
                row.appendChild(dateCell);
                row.appendChild(actionCell);

                documentTableBody.appendChild(row);
            });

        } catch (error) {
            console.error("Error:", error);

            documentTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-danger text-center">
                        Unable to load documents.
                    </td>
                </tr>
            `;
        }
    }

    // Refresh button
    refreshButton.addEventListener("click", fetchDocuments);

    // Load documents when the page loads
    fetchDocuments();


  //Final Delete
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

confirmDeleteBtn.addEventListener("click", async function () {

    // Retrieve the file ID stored on the modal button
    const fileId = this.getAttribute("data-file-id");

    console.log("Document ID to delete:", fileId);

    if (!fileId || fileId === "undefined") {
        alert("Document ID not found.");
        return;
    }

    // Disable button to prevent multiple requests
    this.disabled = true;
    const originalHTML = this.innerHTML;
    this.innerHTML = "Deleting...";

    try {
        // Send AJAX POST request to FastAPI
        const response = await fetch("/delete-doc", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                file_id: Number(fileId)
            })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(
                result.detail || result.error || "Failed to delete document"
            );
        }

        console.log("Delete response:", result);

        // Close Bootstrap modal
        const modalElement = document.getElementById("deleteConfirmModal");
        const modal = bootstrap.Modal.getInstance(modalElement);

        if (modal) {
            modal.hide();
        }

        // Refresh the documents table
        await fetchDocuments();

        alert(result.message || "Document deleted successfully!");

    } catch (error) {
        console.error("Delete error:", error);
        alert("Error: " + error.message);

    } finally {
        this.disabled = false;
        this.innerHTML = originalHTML;
    }
});

//For the upload document section
const uploadForm = document.getElementById("uploadForm");
    const fileInput = document.getElementById("documentFiles");
    const selectedFiles = document.getElementById("selectedFiles");
    const uploadBtn = document.getElementById("uploadBtn");

    const uploadResult = document.getElementById("uploadResult");
    const uploadError = document.getElementById("uploadError");

    // Show filename immediately after selecting
    fileInput.addEventListener("change", function () {
        selectedFiles.textContent = this.files.length
            ? `📄 ${this.files[0].name}`
            : "No file selected.";
    });

    // Upload using AJAX
    uploadForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!fileInput.files.length) {
            alert("Please select a document.");
            return;
        }

        uploadResult.classList.add("d-none");
        uploadError.classList.add("d-none");

        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        uploadBtn.disabled = true;
        uploadBtn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2"></span>
            Uploading...
        `;

        try {
            const response = await fetch("/upload-doc", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(
                    result.detail || result.error || "Upload failed."
                );
            }

            // Display upload result
            document.getElementById("uploadedFilename").textContent =
                result.message;

            document.getElementById("uploadedFileId").textContent =
                result.file_id;

            uploadResult.classList.remove("d-none");
            uploadResult.style.opacity = "1";

          setTimeout(() => {
           uploadResult.style.transition = "opacity 0.5s ease";
          uploadResult.style.opacity = "0";

          setTimeout(() => {
          uploadResult.classList.add("d-none");
          uploadResult.style.opacity = "1";
         }, 500);

          }, 5000);

            // Reset form
            uploadForm.reset();
            selectedFiles.textContent = "No file selected.";

            // Refresh documents table
            document.getElementById("refreshDocuments")?.click();

        } catch (error) {
            console.error("Upload error:", error);

            uploadError.textContent = error.message;
            uploadError.classList.remove("d-none");

        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML =
                '<i class="bi bi-upload me-2"></i> Upload file';
        }
    });

});


