"""One configurable location for private runtime data and research history."""
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get('BOT_DATA_DIR', Path(__file__).resolve().parents[1] / 'data')).expanduser().resolve()
