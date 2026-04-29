FROM python:3.11-slim

# System deps for audio/numpy/webrtc wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    libportaudio2 \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy project files
COPY pyproject.toml ./
COPY pa_agent.py ./

# Install deps into system site-packages via uv
RUN uv pip install --system --no-cache -e .

# Pre-download plugin assets (silero VAD, turn-detector model, noise-cancellation)
# Doing this at build time avoids first-request latency.
RUN python pa_agent.py download-files || true

# Production startup mode
CMD ["python", "pa_agent.py", "start"]
