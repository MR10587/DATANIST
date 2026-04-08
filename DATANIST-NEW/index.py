"""
Vercel deployment entry point for DATANIST Flask app
"""
import os
import sys
from pathlib import Path

# Ensure app module is in path
sys.path.insert(0, str(Path(__file__).parent))

# Try to import the real app, fallback to basic Flask if it fails
try:
    from app.app import app
except ImportError as e:
    # Fallback: create a minimal Flask app for diagnostics
    from flask import Flask, jsonify
    app = Flask(__name__)
    
    @app.route('/')
    def error():
        return jsonify({
            "error": "Failed to import main app",
            "message": str(e),
            "python_path": sys.path
        }), 500

# Alias for Vercel
application = app

