// /stores/meet.js
import { defineStore } from "pinia";

export const useMeetStore = defineStore("meet", {
  state: () => ({
    instructor: null,
    students: [],
    remoteUsers: [],
    localVideoTrack: null,
    localAudioTrack: null,
  }),
});
