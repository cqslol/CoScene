# CoScene

Real-time collaborative scene editing for the Unity Editor. Think Roblox Studio's Team Create, but for Unity.

CoScene lets multiple people work in the same Unity scene at the same time, from anywhere. Move an object on your machine and your teammate sees it move on theirs, live. No more passing project files back and forth over Git or Plastic, no more "wait, are you done editing yet, I need to push." Just open the scene and work together.

> **Status:** Early development (v1). Core syncing works. Expect rough edges. See the [Roadmap](#roadmap) for what is and isn't done yet.

## Why this exists

Unity collaboration today usually means version control. Git, Plastic SCM, or Unity's own cloud tooling. That works, but it's serial: one person edits, commits, and hands off, and merge conflicts on scene files are notoriously painful. It's a long way from the experience Roblox developers get with Team Create, where everyone is just in the same place at the same time.

CoScene closes that gap. It's a lightweight Unity Editor plugin plus a small relay server that keeps everyone's scene in sync in real time. It isn't trying to replace version control for your whole project. It's for the live, in-the-room part of building a scene together.

## Features

Working in v1:

- **Live object syncing.** Position, rotation, and scale changes sync between all connected editors in real time.
- **Presence.** See where your collaborators are looking in the scene with color-coded camera markers, one color per person.
- **Rooms.** Create a session, share a room code, and your teammates join from anywhere. Traffic runs through a relay server so nobody has to mess with port forwarding or IP addresses.
- **Minimal setup.** Install the package, open the CoScene window, host or join. That's it.

Not done yet (see [Roadmap](#roadmap)):

- Hierarchy syncing (creating and deleting objects)
- Script syncing
- Object locking and proper conflict resolution
- The web dashboard at [cqs.lol](https://cqs.lol)

## How it works

CoScene has two parts.

**The Unity Editor plugin** is what you install in your project. It hooks into Unity's editor events to detect when something in your scene changes, serializes that change, and sends it out. It also listens for incoming changes from other people and applies them to your local scene.

**The relay server** is a small Node.js WebSocket server that sits in the middle. Everyone connects to it instead of connecting directly to each other. When you change something, the message goes to the server, and the server forwards it to everyone else in your room. This is what makes "collaborate from anywhere" work without anyone needing to configure their router.

```
You ──► Relay Server ──► Everyone else in your room
You ◄── Relay Server ◄── Everyone else in your room
```

Object identity is handled with a small component called CoSceneIdentity that stamps a stable GUID onto each GameObject. Unity doesn't give objects a consistent ID across different machines, so CoScene assigns its own. That GUID is what both sides use to agree on which object a given change refers to.

For v1, conflicts use last-write-wins. If two people move the same object at the same time, the most recent update wins. It's simple and good enough for small teams. Proper locking is on the roadmap.

## Requirements

- **Unity 2021.3 LTS or newer.** CoScene uses `ObjectChangeEvents`, a Unity API added in 2020.2 that fires whenever something in your scene changes. 2021.3 LTS is the minimum we officially support since it's the oldest version most active projects are still on.
- **.NET Standard 2.1.** This is the default in Unity 2021.3 and newer so you don't need to change anything. It's what gives us access to `System.Net.WebSockets` for the connection to the relay server.
- **An internet connection** (or LAN) during a session. CoScene needs to reach the relay server while you're collaborating. It does not affect your project when you're working solo.

## Installation

### Unity Package Manager (recommended)

1. In Unity, open **Window > Package Manager**.
2. Click the **+** button in the top left and choose **Add package from git URL**.
3. Paste:
   ```
   https://github.com/cqslol/coscene.git
   ```
4. Click **Add**. Unity will pull in the package.

### Manual

1. Download the latest release from the [Releases](https://github.com/cqslol/coscene/releases) page.
2. Drag the `CoScene` folder into your project's `Assets` directory.

## Usage

### Hosting a session

1. Open **Window > CoScene** to bring up the CoScene panel.
2. Click **Host Session**. You'll get a room code.
3. Share that code with whoever you want to work with.

### Joining a session

1. Open **Window > CoScene**.
2. Paste the room code into the field and click **Join Session**.
3. Once connected, you'll see the other people in the room listed in the panel, and their camera markers will appear in your Scene view.

That's it. Move things around and watch them sync.

> **Note:** Everyone needs to be working in a copy of the same project for syncing to make sense. CoScene syncs changes to a scene, it does not transfer the whole project for you. Make sure your teammates have the project before you start a session.

## Self-hosting the relay server

By default CoScene points at a hosted relay server, but you can run your own. The server is a small Node.js app.

1. Clone the repo and go into the server folder:
   ```
   git clone https://github.com/cqslol/coscene.git
   cd coscene/server
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start it:
   ```
   npm start
   ```

It deploys cleanly to Render, Railway, or any host that runs Node. Once it's up, point the plugin at your server URL in the CoScene settings.

## Roadmap

- [x] Relay server with rooms
- [x] Presence (camera markers)
- [x] Transform syncing
- [ ] Hierarchy syncing (add and delete objects)
- [ ] Component and property syncing
- [ ] Object locking and conflict resolution
- [ ] Script syncing
- [ ] Web dashboard at [collab.cqs.lol](https://collab.cqs.lol)
- [ ] Session activity history

## Support

Run into a bug or have a question? Join the Discord: **[discord.gg/cqs](https://discord.gg/cqs)**

A web dashboard for managing sessions is coming to **[cqs.lol](https://cqs.lol)**.

## Contributing

CoScene is open source and contributions are welcome. If you want to help:

1. Fork the repo.
2. Create a branch for your change.
3. Open a pull request describing what you did and why.

If you're planning something big, drop into the Discord first so we can talk it through before you sink time into it.

## License

MIT. See [LICENSE](LICENSE) for the full text. Use it, fork it, ship it, whatever you want.

## Acknowledgements

Inspired by [Roblox Studio's Team Create](https://create.roblox.com/docs/projects/collaboration) feature. 
& [UnityMultiUserPlugin](https://github.com/tmcgillicuddy/UnityMultiUserPlugin) project from 2017.

Built by [cqs](https://github.com/cqslol)
