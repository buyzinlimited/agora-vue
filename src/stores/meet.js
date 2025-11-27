// /stores/meet.js
import { defineStore } from "pinia";

export const useMeetStore = defineStore("meet", {
  state: () => ({
    remoteUsers: [],
    localVideoTrack: null,
    localAudioTrack: null,
  }),
});
