# Development Guide

This comprehensive guide covers the development workflow, coding standards, testing practices, and deployment procedures for the FGCS project.

## Quick Start for New Developers

### Prerequisites

1. **Node.js** (version >= 20.10.0)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **Yarn** (package manager)
   - Install: `npm install --global yarn`
   - Verify: `yarn --version`

3. **Python 3.11.9**
   - Download from [python.org](https://www.python.org/downloads/release/python-3119/)
   - Verify: `python --version`

4. **Docker** (for SITL simulator)
   - Download from [docker.com](https://www.docker.com/)
   - Verify: `docker --version`

### Initial Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Avis-Drone-Labs/FGCS.git
   cd FGCS
   ```

2. **Install pre-commit hooks:**

   ```bash
   pip install pre-commit
   pre-commit install
   ```

3. **Set up Python virtual environment:**

   ```bash
   cd radio
   python -m venv venv

   # Windows
   venv\Scripts\activate

   # Linux/Mac
   source venv/bin/activate

   pip install -r requirements.txt
   ```

4. **Install Node.js dependencies:**

   ```bash
   cd ../gcs
   yarn install
   ```

5. **Configure environment variables:**

   ```bash
   cp .env_sample .env
   ```

6. **Add Maptiler API key**:
Edit the `.env` file to include your Maptiler API key, it can be generated [on maptilers website](https://cloud.maptiler.com/account/keys).

7. **Generate param definitions:**

    ```bash
    cd data
    python generate_param_definitions.py
    ```

   This now fetches ArduPlane and ArduCopter definitions for all available 4.x
   versions (from 4.0 up to latest 4.x) and writes versioned files plus a
   `gen_apm_params_versions.json` manifest.

### Running the Application

#### Method 1: Using Scripts (Recommended)

**Windows:**

```bash
# First time setup
./run.bat /path/to/venv update

# Subsequent runs
./run.bat /path/to/venv
```

**Linux/Mac:**

```bash
./run.bash
```

#### Method 2: Manual Start

**Terminal 1 - Backend:**

```bash
cd radio
source venv/bin/activate  # or venv\Scripts\activate on Windows
python app.py
```

**Terminal 2 - Frontend:**

```bash
cd gcs
yarn dev
```

**Terminal 3 - SITL Simulator (Optional):**

```bash
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl
```

### Running the Simulator

#### Quick Start with Docker

1. **Pull the SITL image:**

   ```bash
   docker pull kushmakkapati/ardupilot_sitl
   ```

2. **Start basic simulator (ArduCopter):**

   ```bash
   docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl
   ```

3. **Connect FGCS to simulator:**
   - Backend connection string: `tcp:127.0.0.1:5760`
   - This exposes the MAVLink connection on port 5760

#### Advanced SITL Configuration

##### Different Vehicle Types

```bash
# ArduPlane
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduPlane

# ArduCopter
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduCopter
```

##### Firmware Version Selection

```bash
# Pinned release (recommended format)
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduCopter FIRMWARE_VERSION=4.6.3

# Plane pinned release
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduPlane FIRMWARE_VERSION=4.6.3

# Dynamic selectors
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduCopter FIRMWARE_VERSION=latest
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduCopter FIRMWARE_VERSION=stable
docker run -it --rm -p 5760:5760 -v fgcs_ardupilot_cache:/ardupilot_cache kushmakkapati/ardupilot_sitl VEHICLE=ArduCopter FIRMWARE_VERSION=beta
```

Accepted firmware selectors:

- `latest`, `stable`, `beta`
- `4.x.y` (resolved to `Copter-4.x.y` for ArduCopter and `Plane-4.x.y` for ArduPlane)
- `Copter-4.x.y` / `Plane-4.x.y`
- `ArduCopter-stable` / `ArduCopter-beta` / `ArduPlane-stable` / `ArduPlane-beta`

Note: pass `VEHICLE=...` and `FIRMWARE_VERSION=...` as trailing command arguments (as shown above), not as `-e` environment variables.

Using `-v fgcs_ardupilot_cache:/ardupilot_cache` is recommended so pinned versions are reused between runs.

##### Dynamic Selector Update Behavior (`latest` / `stable` / `beta`)

When you use `FIRMWARE_VERSION=latest` (same idea for `stable` and `beta`), the launcher treats it as a dynamic channel and resolves the current upstream ref each run.

Example timeline:

1. Day 1: run with `latest`. The container checks out the current upstream ref and builds SITL if needed.
2. Day 2: upstream `latest` moves to a newer commit/tag.
3. Day 3: run again with `latest`. The launcher resolves the new ref, checks it out, detects commit change, and rebuilds so the binary matches the checked-out source.

This prevents stale binaries from being reused after a ref change.

Important cache note:

- `fgcs_ardupilot_cache` is primarily used for pinned versions (`4.x.y`) under `/ardupilot_cache`.
- Dynamic channels use the default worktree (`/ardupilot`). With `--rm`, container filesystem state is ephemeral between runs, so dynamic channels may refetch/rebuild more often.

##### Custom Starting Location

```bash
docker run -it --rm -p 5760:5760 kushmakkapati/ardupilot_sitl \
  VEHICLE=ArduCopter LAT=-35.363261 LON=149.165230 ALT=584 DIR=353
```

##### Multiple Ports (for concurrent connections)

```bash
docker run -it --rm -p 5760:5760 -p 5763:5763 kushmakkapati/ardupilot_sitl
```

##### Custom Parameters and Missions

1. **Create files in your working directory:**
   - `custom_params.parm` - Custom parameter file
   - `mission.txt` - Mission waypoints file

2. **Mount files into container:**

   ```bash
   docker run -it --rm -p 5760:5760 -p 5763:5763 \
     -v .:/sitl_setup/custom kushmakkapati/ardupilot_sitl VEHICLE=ArduPlane
   ```

## Code Standards

### Python Code Style

We use **Ruff** for Python code formatting and linting:

```bash
# Format code
ruff format .

# Check for linting issues
ruff check .

# Fix auto-fixable issues
ruff check --fix .
```

### JavaScript/TypeScript Code Style

We use **Prettier** and **ESLint**:

```bash
cd gcs

# Format code
yarn format

# Check linting
yarn lint

# Fix auto-fixable issues
yarn lint:fix
```

## Testing

### Backend Testing

Backend tests use **pytest** with MAVLink simulation:

```bash
cd radio

# Run all tests
pytest

# Run with verbose output
pytest -v

# Stop on first failure
pytest -x

# Run specific test file
pytest tests/test_params.py

# Run specific test
pytest -k "test_param_set"

# Generate coverage report
pytest --cov=app --cov-report=html tests/
```

### Frontend Testing

Frontend tests use **Playwright** to test the electron app:

To run the tests locally you can use:

```bash
yarn test
```

This will build the application locally and then run the playwright tests, this is required because the typescript files need to be compiled. Everytime you make any changes to any of the frontend you must rebuild.

If you want to re-run the tests without re-building:

```bash
yarn test:nobuild
```

## Automated Desktop Releases

Desktop release artifacts are built automatically when a version tag is pushed.

### Trigger

Push a tag in semver format prefixed with `v`:

```bash
git tag v0.2.8-alpha.1
git push origin v0.2.8-alpha.1
```

The workflow creates or updates a draft GitHub Release and uploads installers.

### Restrict Who Can Release

The workflow enforces two checks before building:

- `RELEASE_ALLOWED_OWNER` must match the repository owner.
- `RELEASE_ALLOWED_ACTOR` must match the GitHub username that pushed the tag.

### Produced Artifacts

- Windows x64: `FGCS-Windows-<version>-Setup.exe`
- macOS x64: `FGCS-Mac-<version>-Installer-x64.dmg`
- macOS arm64: `FGCS-Mac-<version>-Installer-arm64.dmg`

### Publishing

Releases are uploaded as drafts. After validating artifacts, publish the draft release in GitHub.

### Rollback

If a tagged release fails:

1. Delete the tag locally and remotely.
2. Fix the issue.
3. Recreate and push the tag.

```bash
git tag -d v0.2.8-alpha.1
git push origin :refs/tags/v0.2.8-alpha.1
```
