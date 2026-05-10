# Startup Guide

Follow these steps to get the MockMate application up and running.

## 1. Start the Backend

The backend is a FastAPI application. The virtual environment is located in the root directory.

1.  **Open a Terminal** in the project root (`INTERVIEW_AI`).
2.  **Activate the Virtual Environment**:
    ```bash
    source .venv/bin/activate
    ```
3.  **Navigate to the Backend directory**:
    ```bash
    cd backend
    ```
4.  **Start the Backend Server**:
    ```bash
    uvicorn main:app --reload
    ```
    The backend will be available at `http://localhost:8000`.

### Exact Backend Commands (Copy/Paste)

From project root (`/Users/afrozkhan47/INTERVIEW_AI`):

```bash
source .venv/bin/activate
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## 2. Start the Frontend

The frontend is a Next.js application located in the root directory.

1.  **Open a Second Terminal** and navigate to the root directory:
    ```bash
    cd .. # If you are in the backend directory
    ```
2.  **Install Dependencies** (if not already installed):
    ```bash
    npm install
    ```
3.  **Start the Development Server**:
    ```bash
    npm run dev
    ```
    The website will be available at `http://localhost:3000`.

## 3. Recommended Stable Mode (Low CPU)

If your laptop shuts down while running the app, use this mode.
It avoids heavy file-watch reload loops (`uvicorn --reload` and `next dev`) and is more stable.

### Terminal 1 (Backend - Stable)

```bash
cd /Users/afrozkhan47/INTERVIEW_AI
source .venv/bin/activate
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

If the command above shows a PID, kill it (replace `12345` with the real PID):

```bash
kill -9 12345
```

Now start backend without reload:

```bash
cd /Users/afrozkhan47/INTERVIEW_AI/backend
uvicorn main:app --host 127.0.0.1 --port 8000
```

### Terminal 2 (Frontend - Stable Production Serve)

```bash
cd /Users/afrozkhan47/INTERVIEW_AI
npm install
npm run build
npm run start
```

Open:

```text
http://127.0.0.1:3000
```

## Troubleshooting

- **"Fail to load the resume"**: This error typically means the frontend cannot communicate with the backend. Ensure the backend server is running and accessible at `http://localhost:8000`.
- **API Keys**: Ensure you have a valid `.env` file in the `backend` directory with your `GROQ_API_KEY`.
- **`[Errno 48] Address already in use`**: Port `8000` is already occupied.
  1. Find the PID:
     ```bash
     lsof -nP -iTCP:8000 -sTCP:LISTEN
     ```
  2. Kill the process using the real PID from the output (do not type `<PID>` literally):
     ```bash
     kill -9 12345
     ```
  3. Start backend again:
     ```bash
     cd /Users/afrozkhan47/INTERVIEW_AI/backend
     uvicorn main:app --reload --host 127.0.0.1 --port 8000
     ```
  4. If you do not want to kill the old process, run backend on another port:
     ```bash
     uvicorn main:app --reload --host 127.0.0.1 --port 8012
     ```
- **Laptop shutdown under load**:
  - Use **Section 3: Recommended Stable Mode (Low CPU)**.
  - Avoid running multiple backend/frontend instances at the same time.
  - Keep only one backend terminal and one frontend terminal open.
