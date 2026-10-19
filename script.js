const form = document.getElementById("inspection-form");
const recordList = document.getElementById("record-list");
const message = document.getElementById("form-message");

const bridgesCount = document.getElementById("bridges");
const inspectionCount = document.getElementById("inspections");
const defectsCount = document.getElementById("defects");
const repairsCount = document.getElementById("repairs");

let editingId = null;

const submitButton = form.querySelector(
    'button[type="submit"], button:not([type])'
);

const originalSubmitText = submitButton
    ? submitButton.textContent.trim()
    : "Add Inspection";

// Add a Cancel Edit button automatically
const cancelButton = document.createElement("button");
cancelButton.type = "button";
cancelButton.textContent = "Cancel Edit";
cancelButton.style.display = "none";
cancelButton.style.marginLeft = "8px";

if (submitButton) {
    submitButton.insertAdjacentElement("afterend", cancelButton);
}

async function requestJSON(url, options = {}) {
    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || "The request failed.");
    }

    return result;
}

async function loadDashboard() {
    try {
        const data = await requestJSON("/api/dashboard");

        bridgesCount.textContent = data.total_bridges;
        inspectionCount.textContent = data.inspections_recorded;
        defectsCount.textContent = data.reported_defects;
        repairsCount.textContent = data.repairs_pending;
    } catch (error) {
        console.error("Dashboard error:", error);
        message.textContent = "Could not load dashboard statistics.";
    }
}

function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
}

function displayDate(dateString) {
    if (!dateString) return "—";

    const parts = dateString.split("-");
    if (parts.length !== 3) return dateString;

    const date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function startEditing(record) {
    editingId = record.id;

    document.getElementById("bridge-name").value =
        record.bridge_name;

    document.getElementById("inspection-date").value =
        record.inspection_date;

    document.getElementById("record-status").value =
        record.status;

    document.getElementById("observations").value =
        record.observations;

    if (submitButton) {
        submitButton.textContent = "Update Inspection";
    }

    cancelButton.style.display = "inline-block";
    message.textContent =
        "Editing " + record.bridge_name + ". Make your changes below.";

    form.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    document.getElementById("bridge-name").focus();
}

function cancelEditing() {
    editingId = null;
    form.reset();

    if (submitButton) {
        submitButton.textContent = originalSubmitText;
    }

    cancelButton.style.display = "none";
    message.textContent = "Editing cancelled.";
}

cancelButton.addEventListener("click", cancelEditing);

async function deleteInspection(record) {
    const confirmed = window.confirm(
        "Permanently delete the inspection for " +
        record.bridge_name +
        "?\n\nThis action cannot be undone."
    );

    if (!confirmed) return;

    try {
        await requestJSON("/api/inspections/" + record.id, {
            method: "DELETE"
        });

        if (editingId === record.id) {
            cancelEditing();
        }

        message.textContent =
            "Inspection deleted successfully.";

        await refreshApp();
    } catch (error) {
        message.textContent = error.message;
    }
}

async function loadInspections() {
    try {
        const records = await requestJSON("/api/inspections");

        recordList.replaceChildren();

        if (records.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell("No inspection records yet.");

            cell.colSpan = 4;
            cell.style.textAlign = "center";

            row.appendChild(cell);
            recordList.appendChild(row);
            return;
        }

        records.forEach((record) => {
            const row = document.createElement("tr");

            // Bridge name and observation
            const bridgeCell = document.createElement("td");

            const bridgeName = document.createElement("strong");
            bridgeName.textContent = record.bridge_name;

            const observation = document.createElement("small");
            observation.textContent = record.observations;
            observation.style.display = "block";
            observation.style.marginTop = "5px";
            observation.style.whiteSpace = "normal";

            bridgeCell.append(bridgeName, observation);

            // Inspection date
            const dateCell = createCell(
                displayDate(record.inspection_date)
            );

            // Inspection status
            const statusCell = document.createElement("td");
            const statusLabel = document.createElement("span");

            statusLabel.textContent = record.status;
            statusLabel.classList.add("status");

            if (record.status === "Reviewed") {
                statusLabel.classList.add("reviewed");
            } else {
                statusLabel.classList.add("pending");
            }

            statusCell.appendChild(statusLabel);

            // Edit and Delete buttons
            const actionsCell = document.createElement("td");
            actionsCell.style.whiteSpace = "nowrap";

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.textContent = "✏️ Edit";
            editButton.style.marginRight = "6px";

            editButton.addEventListener("click", () => {
                startEditing(record);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "🗑️ Delete";

            deleteButton.addEventListener("click", () => {
                deleteInspection(record);
            });

            actionsCell.append(editButton, deleteButton);

            row.append(
                bridgeCell,
                dateCell,
                statusCell,
                actionsCell
            );

            recordList.appendChild(row);
        });
    } catch (error) {
        console.error("Inspection loading error:", error);
        message.textContent =
            "Could not load records. Check the Flask server.";
    }
}

async function refreshApp() {
    await Promise.all([
        loadDashboard(),
        loadInspections()
    ]);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const bridgeName =
        document.getElementById("bridge-name").value.trim();

    const inspectionDate =
        document.getElementById("inspection-date").value;

    const status =
        document.getElementById("record-status").value;

    const observations =
        document.getElementById("observations").value.trim();

    if (!bridgeName || !inspectionDate || !status || !observations) {
        message.textContent = "Please complete all fields.";
        return;
    }

    if (submitButton) submitButton.disabled = true;
    cancelButton.disabled = true;

    message.textContent = editingId !== null
        ? "Updating inspection..."
        : "Saving inspection...";

    try {
        const isEditing = editingId !== null;

        const url = isEditing
            ? "/api/inspections/" + editingId
            : "/api/inspections";

        const result = await requestJSON(url, {
            method: isEditing ? "PUT" : "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bridge_name: bridgeName,
                inspection_date: inspectionDate,
                status: status,
                observations: observations
            })
        });

        editingId = null;
        form.reset();

        if (submitButton) {
            submitButton.textContent = originalSubmitText;
        }

        cancelButton.style.display = "none";
        message.textContent = result.message ||
            "Inspection saved successfully.";

        await refreshApp();
    } catch (error) {
        message.textContent = error.message;
    } finally {
        if (submitButton) submitButton.disabled = false;
        cancelButton.disabled = false;
    }
});

refreshApp();