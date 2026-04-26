# TrinetraAi: The Marauder's Eye — Crowd Safety Vision

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A cutting-edge crowd safety monitoring application inspired by the Marauder's Map from Harry Potter. Built for hackathons, this browser-based app provides real-time crowd analysis using computer vision, with a magical parchment-themed UI that makes safety monitoring feel like an adventure.

## ✨ Features

### 🛡️ Real-Time Safety Monitoring

- **Live People Count** with peak tracking
- **Safety Zone Assessment** - Safe / Watch / High Risk / Stampede Risk based on crowd density
- **Foot Traffic Analysis** - Entry/exit counters with centroid tracking
- **Crowd Flow Direction** - Compass-style indicators showing movement patterns

### 👥 Demographic Insights

- **Age & Gender Breakdown** with interactive bar charts
- **Mask Detection** percentage for health compliance
- **Behavior Alerts** for fall and running events

### 🎨 Immersive Harry Potter Theme

- Parchment background with ink-style typography
- Hogwarts-inspired color scheme (Gryffindor maroon and gold)
- "Mischief Managed" feature to temporarily hide sensitive data
- Spell-card carousel navigation on landing page

### 📊 Advanced Analytics

- **Heatmap Overlay** - Toggleable crowd density visualization
- **Snapshot Capture** - Download PNG images with overlaid statistics
- **Incident Recording** - 10-second WebM clips with live overlays
- **Historical Charts** and alerts feed

### 🔒 Privacy-First Design

- Everything runs locally in the browser
- No data uploads or external servers required
- Zero technical jargon in the user interface

## 🚀 Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS v4 with custom animations
- **AI/ML**: TensorFlow.js + COCO-SSD for person detection, Face-API for demographics
- **Audio**: Web Audio API for safety alarms
- **Build**: pnpm monorepo with workspace management
- **Authentication**: Node.js server with MongoDB (optional)

## 📋 Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm package manager
- MongoDB (optional, for authentication features)
- Modern web browser (Chrome/Edge recommended)

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/jatinkumargdm-ops/TrinetraAi.git
   cd TrinetraAi
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Approve build scripts** (if prompted)

   ```bash
   pnpm approve-builds
   ```

4. **Set up MongoDB** (optional, for authentication)
   - Install MongoDB Community Edition
   - Start the MongoDB service

## 🎯 Usage

### Quick Start

```bash
pnpm dev
```

This starts both the authentication server (port 3001) and frontend (port 22338).

### Alternative: Frontend Only

If you want to skip authentication:

```bash
pnpm --filter @workspace/crowd-intel dev
```

### Accessing the Application

1. Open `http://localhost:22338` in your browser
2. Create an account or sign in (if using auth server)
3. Choose your input source:
   - Webcam (grant camera permissions)
   - Video file upload
   - Image upload
4. Monitor the dashboard for real-time crowd safety insights

## 📁 Project Structure

```
TrinetraAi/
├── artifacts/
│   ├── api-server/          # Backend API server (legacy)
│   ├── auth-server/         # Authentication server
│   │   ├── src/
│   │   │   ├── lib/auth.ts  # Auth logic
│   │   │   ├── models/User.ts
│   │   │   └── routes/auth.ts
│   └── crowd-intel/         # Main frontend application
│       ├── public/face-models/  # AI model weights
│       └── src/
│           ├── components/      # Reusable UI components
│           ├── hooks/          # Custom React hooks
│           ├── lib/            # Core business logic
│           │   ├── detection.ts # Computer vision wrappers
│           │   ├── tracker.ts   # Centroid tracking
│           │   ├── audio.ts     # Audio alarms
│           │   └── utils.ts     # Utilities
│           ├── pages/          # Main application pages
│           │   ├── Landing.tsx  # Source selection
│           │   ├── Dashboard.tsx # Main monitoring interface
│           │   └── Auth.tsx     # Authentication
│           └── App.tsx         # Main router
├── lib/
│   ├── api-client-react/    # Generated API client
│   ├── api-spec/           # OpenAPI specifications
│   ├── api-zod/            # Type-safe API schemas
│   └── db/                 # Database schemas (Drizzle ORM)
├── scripts/                # Utility scripts
├── HOW_TO_RUN.md          # Detailed setup guide
└── package.json           # Workspace configuration
```

## 🎮 Key Features in Action

### Dashboard Controls

- **Heatmap Toggle**: Visualize crowd density patterns
- **Snapshot**: Capture current scene with statistics overlay
- **Record Incident**: Create 10-second video clips with live data
- **Audio Alarms**: Configurable safety tier notifications
- **Pause/Resume**: Control live analysis
- **Source Change**: Switch between different input feeds

### Safety Tiers

- 🟢 **Safe**: Normal crowd levels
- 🟡 **Watch**: Moderate density, monitor closely
- 🔴 **High Risk**: Elevated danger, prepare response
- 🚨 **Stampede Risk**: Critical situation, immediate action required

## 🤝 Contributing

This project was built for hackathon purposes. While contributions are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by traditional crowd monitoring systems
- Harry Potter universe for the magical theming
- Open-source computer vision libraries that make this possible

---

_"I solemnly swear that I am up to no good."_

**Messrs Moony, Wormtail, Padfoot & Prongs are proud to present — The Marauder's Eye** 🪄🛡️</content>
<parameter name="filePath">/Users/sashank/Desktop/TrinetraAi/README.md
