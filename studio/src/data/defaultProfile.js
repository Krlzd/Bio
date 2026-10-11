import heroCutout from "../../../assets/cutouts/sae-frontal-portrait.png";
import stadiumPortrait from "../../../assets/images/sae/stadium-profile.jpg";
import angledPortrait from "../../../assets/images/sae/1f7f36b48f299523ad6d3d7a2267b99b.jpg";
import passingPanel from "../../../assets/images/sae/panel-pass.jpg";
import runningPanel from "../../../assets/images/sae/panel-sprint.jpg";
import colorBreak from "../../../assets/images/sae/color-break.jpg";
import detailPanel from "../../../assets/images/sae/11cf7ab166a3d5eb45a2da4af2a7f77b.jpg";

export const defaultProfile = {
  schemaVersion: 1,
  layoutPreset: "scrapbook",
  profile: {
    displayName: "Sae Itoshi",
    username: "sae10",
    status: "reading the next pass",
    introduction: "Attacking midfielder. One pass ahead, always."
  },
  theme: {
    mode: "day",
    paper: "#f2f0e8",
    ink: "#111719",
    teal: "#4e8d96",
    blue: "#547c9a"
  },
  sections: [
    {
      id: "player-dossier",
      kind: "dossier",
      title: "PLAYER DOSSIER",
      body: "A calm face. A decision already made. The rest of the pitch catches up.",
      image: stadiumPortrait,
      imageAlt: "Sae Itoshi in profile against a football stadium",
      caption: "THE PITCH IS A MAP.",
      visible: true
    },
    {
      id: "field-note",
      kind: "note",
      title: "FIRST, HE SEES IT.",
      body: "The opening isn't found by accident. He watches the field change, then plays into the space that is about to exist.",
      image: angledPortrait,
      imageAlt: "Angled monochrome portrait of Sae looking across the field",
      caption: "FIELD STUDY / 02",
      visible: true
    },
    {
      id: "chapter-pass",
      kind: "chapter",
      title: "THE BALL ARRIVES LATE.",
      body: "The decision was made before anyone else saw the lane.",
      image: passingPanel,
      imageAlt: "Sae reaching into a manga panel as if setting up a pass",
      caption: "ONE PASS, ONE POINT OF VIEW",
      visible: true
    },
    {
      id: "velocity",
      kind: "chapter",
      title: "NO EXTRA MOTION.",
      body: "Control isn't stillness. It's choosing exactly when to break it.",
      image: runningPanel,
      imageAlt: "Sae leaning into a sprint with ink splashes trailing behind him",
      caption: "THE MOMENT THE PAGE TILTS",
      visible: true
    },
    {
      id: "side-b",
      kind: "music",
      title: "AFTER THE FINAL WHISTLE.",
      body: "One track for the walk back to the center circle.",
      image: colorBreak,
      imageAlt: "Selective-color manga close-up of Sae's vivid eyes",
      caption: "SIDE B / LISTENING NOTES",
      spotifyUrl: "",
      spotifyMetadata: null,
      visible: true
    },
    {
      id: "last-look",
      kind: "note",
      title: "ONE LAST LOOK.",
      body: "Still thinking about the next move.",
      image: detailPanel,
      imageAlt: "Monochrome manga close-up of Sae",
      caption: "DRAWN FROM THE MARGINS",
      visible: true
    }
  ],
  media: {
    hero: heroCutout
  }
};

export function createSectionId() {
  return `section-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}
