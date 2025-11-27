<script setup>
import { ref, onBeforeUnmount, nextTick } from "vue";
import AgoraRTC from "agora-rtc-sdk-ng";
import { useMeetStore } from "@/stores/meet";

const meetStore = useMeetStore();

// ---------------- CONFIG ----------------
const APP_ID = "3d25a35f9a60404c8e2c7ac82f621505";
const CHANNEL = "proLiveClass";
const TOKEN =
  "007eJxTYHgi23nG7vvbhYxHsv51JUzTEYxxji5ptPtUen3G0/vZ1dcUGIxTjEwTjU3TLBPNDEwMTJItUo2SzROTLYzSzIwMTQ1M5x1Qz2wIZGQ4ySbNwAiFID4PQ0FRvk9mWapzTmJxMQMDAN29I4I=";
const UID = 0;
// ----------------------------------------

const localVideo = ref(null);
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let screenTrack = null;

// ---------------- JOIN CHANNEL ----------------
const joinChannel = async () => {
  try {
    const uid = await client.join(APP_ID, CHANNEL, TOKEN, UID);
    console.log("Joined with UID:", uid);

    // Create local audio and video tracks
    meetStore.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    meetStore.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    meetStore.localVideoTrack.play(localVideo.value);

    await client.publish([
      meetStore.localAudioTrack,
      meetStore.localVideoTrack,
    ]);

    // ---------------- HANDLE CLIENT EVENTS ----------------

    // User published event
    client.on("user-published", async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);

        // Find or add user in Pinia store
        let remoteUser = meetStore.remoteUsers.find((u) => u.uid === user.uid);
        if (!remoteUser) {
          remoteUser = {
            uid: user.uid,
            videoTrack: null,
            audioTrack: null,
            name: `Student ${user.uid}`, // optional, replace with real name
            avatar: "/default-avatar.png",
          };
          meetStore.remoteUsers.push(remoteUser);
        }

        // Handle video
        if (mediaType === "video") {
          remoteUser.videoTrack = user.videoTrack;
          await nextTick();
          const container = document.getElementById("remote-" + user.uid);
          if (container) user.videoTrack.play(container);
        }

        // Handle audio
        if (mediaType === "audio") {
          remoteUser.audioTrack = user.audioTrack;
          user.audioTrack.play();
        }
      } catch (err) {
        console.error("Error subscribing to user:", user.uid, err);
      }
    });

    // User unpublished event
    client.on("user-unpublished", async (user, mediaType) => {
      const remoteUser = meetStore.remoteUsers.find((u) => u.uid === user.uid);
      if (!remoteUser) return;

      if (mediaType === "video" && remoteUser.videoTrack) {
        remoteUser.videoTrack.stop();
        remoteUser.videoTrack = null;
      }
      if (mediaType === "audio" && remoteUser.audioTrack) {
        remoteUser.audioTrack.stop();
        remoteUser.audioTrack = null;
      }

      // Remove from store if video ends
      if (mediaType === "video") {
        meetStore.remoteUsers = meetStore.remoteUsers.filter(
          (u) => u.uid !== user.uid
        );
      }
    });
  } catch (err) {
    console.error("JOIN ERROR:", err);
  }
};

// ---------------- LEAVE MEET ----------------
const leaveChannel = async () => {
  if (meetStore.localAudioTrack) meetStore.localAudioTrack.close();
  if (meetStore.localVideoTrack) meetStore.localVideoTrack.close();
  if (screenTrack) screenTrack.close();

  await client.leave();
  meetStore.remoteUsers = [];
};

// ---------------- MIC / CAMERA ----------------
const toggleMic = () => {
  if (!meetStore.localAudioTrack) return;
  meetStore.localAudioTrack.setEnabled(!meetStore.localAudioTrack.enabled);
};

const toggleCamera = () => {
  if (!meetStore.localVideoTrack) return;
  meetStore.localVideoTrack.setEnabled(!meetStore.localVideoTrack.enabled);
};

// ---------------- SCREEN SHARE ----------------
const startScreenShare = async () => {
  if (!client) return;

  screenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");

  if (meetStore.localVideoTrack) {
    await client.unpublish(meetStore.localVideoTrack);
  }

  await client.publish(screenTrack);
  await nextTick();
  screenTrack.play(localVideo.value);

  screenTrack.on("track-ended", async () => {
    await client.unpublish(screenTrack);

    if (meetStore.localVideoTrack) {
      await client.publish(meetStore.localVideoTrack);
      await nextTick();
      meetStore.localVideoTrack.play(localVideo.value);
    }

    screenTrack = null;
  });
};

// ---------------- SHARE LINK ----------------
const shareMeet = () => {
  const url = `${window.location.origin}/meet?channel=${CHANNEL}&token=${TOKEN}`;
  navigator.clipboard.writeText(url);
  alert("Meet link copied: " + url);
};

onBeforeUnmount(leaveChannel);
</script>

<template>
  <main class="mx-auto px-4 py-4">
    <div class="text-center border rounded-xl p-4">
      <div
        ref="localVideo"
        class="mt-3 bg-black rounded"
        style="width: 100%; height: 300px"
      ></div>

      <div class="mt-3 flex gap-2">
        <button
          @click="toggleMic"
          class="bg-yellow-500 p-2 rounded cursor-pointer"
          title="Microphone"
        >
          🎤
        </button>
        <button
          @click="toggleCamera"
          class="bg-blue-500 p-2 rounded cursor-pointer"
          title="Camera"
        >
          📹
        </button>
        <button
          @click="startScreenShare"
          class="bg-purple-500 p-2 rounded cursor-pointer"
          title="Screen Share"
        >
          🖥️
        </button>
      </div>
    </div>

    <div class="flex gap-4 mt-8">
      <button
        @click="joinChannel"
        class="bg-green-600 text-white px-4 py-2 rounded"
      >
        Join
      </button>
      <button
        @click="leaveChannel"
        class="bg-red-600 text-white px-4 py-2 rounded"
      >
        Leave
      </button>
      <button
        @click="shareMeet"
        class="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Share Link
      </button>
    </div>
  </main>
</template>
