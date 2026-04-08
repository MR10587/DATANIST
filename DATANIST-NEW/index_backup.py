"""
Minimal test endpoint to bypass import issues
"""

try:
    from app.app import app
except Exception as e:
    print(f"[CRITICAL] Import failed: {e}")
    from flask import Flask
    app = Flask(__name__)
    
    @app.route("/")
    def error():
        return f"Import Error: {str(e)}", 500

print("[INFO] Application loaded")
