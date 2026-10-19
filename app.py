from flask import Flask, request, jsonify, send_from_directory
import sqlite3
from pathlib import Path

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "bridgecare.db"


def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS inspections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bridge_name TEXT NOT NULL,
                inspection_date TEXT NOT NULL,
                status TEXT NOT NULL,
                observations TEXT NOT NULL
            )
        """)


def validate_inspection(data):
    bridge_name = str(data.get("bridge_name", "")).strip()
    inspection_date = str(data.get("inspection_date", "")).strip()
    status = str(data.get("status", "")).strip()
    observations = str(data.get("observations", "")).strip()

    if not all([bridge_name, inspection_date, status, observations]):
        return None, "Please complete all inspection fields."

    if status not in ("Reviewed", "Follow-up pending"):
        return None, "Invalid inspection status."

    return {
        "bridge_name": bridge_name,
        "inspection_date": inspection_date,
        "status": status,
        "observations": observations
    }, None


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    if filename in ("style.css", "script.js"):
        return send_from_directory(BASE_DIR, filename)
    return jsonify({"error": "File not found"}), 404


# GET: Retrieve all saved inspection records
@app.route("/api/inspections", methods=["GET"])
def get_inspections():
    with get_db() as db:
        rows = db.execute("""
            SELECT id, bridge_name, inspection_date, status, observations
            FROM inspections
            ORDER BY id DESC
        """).fetchall()

    return jsonify([dict(row) for row in rows])


# POST: Add a new inspection
@app.route("/api/inspections", methods=["POST"])
def add_inspection():
    data = request.get_json(silent=True) or {}
    inspection, error = validate_inspection(data)

    if error:
        return jsonify({"error": error}), 400

    try:
        with get_db() as db:
            cursor = db.execute("""
                INSERT INTO inspections
                (bridge_name, inspection_date, status, observations)
                VALUES (?, ?, ?, ?)
            """, (
                inspection["bridge_name"],
                inspection["inspection_date"],
                inspection["status"],
                inspection["observations"]
            ))

            new_id = cursor.lastrowid

        return jsonify({
            "message": "Inspection saved successfully.",
            "id": new_id
        }), 201

    except sqlite3.Error:
        return jsonify({"error": "Could not save the inspection."}), 500


# PUT: Edit an existing inspection
@app.route("/api/inspections/<int:inspection_id>", methods=["PUT"])
def edit_inspection(inspection_id):
    data = request.get_json(silent=True) or {}
    inspection, error = validate_inspection(data)

    if error:
        return jsonify({"error": error}), 400

    try:
        with get_db() as db:
            cursor = db.execute("""
                UPDATE inspections
                SET bridge_name = ?,
                    inspection_date = ?,
                    status = ?,
                    observations = ?
                WHERE id = ?
            """, (
                inspection["bridge_name"],
                inspection["inspection_date"],
                inspection["status"],
                inspection["observations"],
                inspection_id
            ))

            if cursor.rowcount == 0:
                return jsonify({"error": "Inspection record not found."}), 404

        return jsonify({"message": "Inspection updated successfully."})

    except sqlite3.Error:
        return jsonify({"error": "Could not update the inspection."}), 500


# DELETE: Permanently delete an inspection
@app.route("/api/inspections/<int:inspection_id>", methods=["DELETE"])
def delete_inspection(inspection_id):
    try:
        with get_db() as db:
            cursor = db.execute("""
                DELETE FROM inspections WHERE id = ?
            """, (inspection_id,))

            if cursor.rowcount == 0:
                return jsonify({"error": "Inspection record not found."}), 404

        return jsonify({"message": "Inspection deleted successfully."})

    except sqlite3.Error:
        return jsonify({"error": "Could not delete the inspection."}), 500


# Dashboard statistics
@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    defect_keywords = (
        "crack", "corrosion", "damage", "damaged",
        "rust", "erosion", "fracture", "deterioration"
    )

    with get_db() as db:
        total_bridges = db.execute("""
            SELECT COUNT(DISTINCT LOWER(TRIM(bridge_name)))
            FROM inspections
        """).fetchone()[0]

        inspections_recorded = db.execute("""
            SELECT COUNT(*) FROM inspections
        """).fetchone()[0]

        repairs_pending = db.execute("""
            SELECT COUNT(*) FROM inspections
            WHERE status = 'Follow-up pending'
        """).fetchone()[0]

        observations = db.execute("""
            SELECT observations FROM inspections
        """).fetchall()

    reported_defects = sum(
        1 for row in observations
        if any(
            keyword in (row["observations"] or "").lower()
            for keyword in defect_keywords
        )
    )

    return jsonify({
        "total_bridges": total_bridges,
        "inspections_recorded": inspections_recorded,
        "reported_defects": reported_defects,
        "repairs_pending": repairs_pending
    })


if __name__ == "__main__":
    init_db()
    app.run(debug=True)