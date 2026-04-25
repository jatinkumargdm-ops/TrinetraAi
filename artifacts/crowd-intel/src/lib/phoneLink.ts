import { Peer, type MediaConnection } from "peerjs";

export type ReceiverHandle = {
  peerId: string;
  destroy: () => void;
};

const PEER_PREFIX = "trinetra-eye-";

function randomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return PEER_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

export function createReceiver(handlers: {
  onReady: (peerId: string) => void;
  onStream: (stream: MediaStream) => void;
  onPeerConnect?: () => void;
  onPeerDisconnect?: () => void;
  onError: (msg: string) => void;
}): ReceiverHandle {
  const id = randomId();
  const peer = new Peer(id, { debug: 1, config: RTC_CONFIG });
  let activeCall: MediaConnection | null = null;

  peer.on("open", (openId) => handlers.onReady(openId));

  peer.on("call", (call) => {
    if (activeCall) {
      try {
        activeCall.close();
      } catch {}
    }
    activeCall = call;
    // Answer without sending our own stream back.
    call.answer();
    call.on("stream", (stream) => {
      handlers.onPeerConnect?.();
      handlers.onStream(stream);
    });
    call.on("close", () => {
      handlers.onPeerDisconnect?.();
      if (activeCall === call) activeCall = null;
    });
    call.on("error", (err) => handlers.onError(err.message ?? String(err)));
  });

  peer.on("error", (err) => {
    handlers.onError(err.message ?? String(err));
  });

  return {
    peerId: id,
    destroy: () => {
      try {
        if (activeCall) activeCall.close();
      } catch {}
      try {
        peer.destroy();
      } catch {}
    },
  };
}

export type BroadcasterHandle = {
  destroy: () => void;
};

export function createBroadcaster(
  targetPeerId: string,
  stream: MediaStream,
  handlers: {
    onConnected: () => void;
    onClosed: () => void;
    onError: (msg: string) => void;
  },
): BroadcasterHandle {
  const peer = new Peer(undefined as unknown as string, {
    debug: 1,
    config: RTC_CONFIG,
  });
  let call: MediaConnection | null = null;
  let connected = false;

  peer.on("open", () => {
    call = peer.call(targetPeerId, stream);
    if (!call) {
      handlers.onError("Could not start the call. Try again.");
      return;
    }
    call.on("stream", () => {
      // Receiver acknowledged with media (or empty); good signal.
    });
    call.on("close", () => {
      connected = false;
      handlers.onClosed();
    });
    call.on("error", (err) => handlers.onError(err.message ?? String(err)));
    call.on("iceStateChanged", (state) => {
      if (
        (state === "connected" || state === "completed") &&
        !connected
      ) {
        connected = true;
        handlers.onConnected();
      }
      if (state === "failed" || state === "disconnected") {
        connected = false;
        handlers.onClosed();
      }
    });
    // Fallback: assume connected after 2s if no ice event fires (rare).
    window.setTimeout(() => {
      if (!connected) {
        connected = true;
        handlers.onConnected();
      }
    }, 2500);
  });

  peer.on("error", (err) => handlers.onError(err.message ?? String(err)));

  return {
    destroy: () => {
      try {
        if (call) call.close();
      } catch {}
      try {
        peer.destroy();
      } catch {}
    },
  };
}
