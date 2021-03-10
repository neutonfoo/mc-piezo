/**
 * DOM Selectors
 */

const $midiFiledrop = $("#midi-filedrop");
const $midiFilename = $("#midi-filename");
const $midiFiledropInput = $("#midi-filedrop > input");

const $piezoNumSelector = $(".piezo-num");
const $tracksSelector = $("#tracks-selector");
const $demoButton = $("#demo-button");
const $generateButtons = $(".generate-button");

// Command textarea
const $commands = $("#commands");

/**
 * Global Variable
 */
const demoSynths = [];
let isDemoPlaying = false;

let midi = {};
let buzzers = 1;
const notes = [];
const selectedTracks = new Set();

/**
 * Filedrop events
 */

// Filedrop styling events
$midiFiledrop.on("dragenter", function () {
  $(this).addClass("hover");
});

$midiFiledrop.on("dragleave", function () {
  $(this).removeClass("hover");
});

$midiFiledrop.on("drop", function () {
  $(this).removeClass("hover");
});

// Filedrop handler
$midiFiledropInput.on("change", function (e) {
  const files = e.target.files;

  if (files.length > 0) {
    const file = e.target.files[0];

    $midiFilename.text(file.name);

    // Parse file
    const reader = new FileReader();
    reader.onload = function (e) {
      // Convert midi to JSON
      midi = new Midi(e.target.result);

      // Generate update
      generateTracksSelector();
    };
    reader.readAsArrayBuffer(file);
  }
});

/**
 * Number of Piezo Buzzers
 */

$piezoNumSelector.on("click", function () {
  buzzers = $(this).val();
});

/**
 * Track Selector Checkboxes
 */

$tracksSelector.on("click", ".track-checkbox", function () {
  this.checked
    ? selectedTracks.add($(this).val())
    : selectedTracks.delete($(this).val());
});

/**
 * Generate Button
 */

$generateButtons.on("click", function () {
  // Have to prepare notes first
  prepareNotes();

  // Clear commands
  $commands.val("");

  const commandsType = $(this).val();

  switch (commandsType) {
    case "direct":
      generateDirect();
      break;
    case "optimized":
      generateOptimized();
      break;
  }
});

$demoButton.on("click", async function () {
  if (isDemoPlaying) {
    // If demo is playing, stop it
    $(this).html("Play Demo");

    while (demoSynths.length) {
      const synth = demoSynths.shift();
      synth.disconnect();
    }
  } else {
    // If demo is not playing, start it
    $(this).html("Stop");

    if (Tone.context.state !== "running") {
      Tone.context.resume();
    }

    const selectedTracksSorted = Array.from(selectedTracks).sort();
    const now = Tone.now() + 0.5;
    for (const trackId of selectedTracksSorted) {
      const track = midi.tracks[trackId];

      // Create a new synth for each track
      const synth = new Tone.PolySynth(Tone.Synth, {
        envelope: {
          attack: 0.02,
          decay: 0.1,
          sustain: 0.3,
          release: 1,
        },
      }).toDestination();

      // Schedule all track notes
      for (const note of track.notes) {
        synth.triggerAttackRelease(
          note.name,
          note.duration,
          note.time + now,
          note.velocity
        );
      }

      demoSynths.push(synth);
    }
  }

  isDemoPlaying = !isDemoPlaying;
});

/**
 * Helper Functions
 */

function generateTracksSelector() {
  // Display Demo button
  $demoButton.show();

  // Clear existing tracks
  $tracksSelector.empty();

  // Loop through each track
  for (const [track_index, track] of midi.tracks.entries()) {
    // If track has no notes, skip
    if (track.notes.length == 0) continue;

    // Generate track name.
    let track_name = `${track_index}. ${
      track.name ? track.name : `Track ${track_index}`
    }`;
    // let track_name = ${ track_index } + ". " + track.name ? `${track.name}` : `Track ${track_index}`;
    const checkbox_html = `<label class="list-group-item">
      <input class="form-check-input me-1 track-checkbox" type="checkbox" value="${track_index}">
      ${track_name} <span class="badge bg-primary">${track.notes.length} notes</span>
    </label>`;

    $tracksSelector.append(checkbox_html);
  }
}

// Combine all notes from selected tracks into a single array
function prepareNotes() {
  // Clear current notes
  notes.length = 0;

  // Get selected tracks as a sorted array
  const selectedTracksSorted = Array.from(selectedTracks).sort();

  //   Assigned to pins so they start from 1 instead of the actial track id
  let trackIndex = 1;

  for (const trackId of selectedTracksSorted) {
    const track = midi.tracks[trackId];
    const trackNotes = track.notes;

    for (const note of trackNotes) {
      // Get only relevant information

      let strippedNote = {
        name: note.name.replace("#", "S"),
        time: note.time,
        duration: note.duration,
        trackId: trackIndex,
      };

      notes.push(strippedNote);
    }

    trackIndex++;
  }

  // Sort the notes array
  notes.sort(sortNotesByTimeAndFrequency);
}

// Generate Direct Commands

// A few things happen here

function generateDirect() {
  const commands = [];

  let previousNoteTime = 0;
  let previousNoteTrackId = -1;

  commands.push("void play() {");

  for (const [noteIndex, note] of notes.entries()) {
    // Calculate the delay between the current note and the previous note
    const delay = Math.floor((note.time - previousNoteTime) * 1000);

    if (buzzers == 1) {
      // Single buzzer

      // If not first note AND there is no delay:
      // If the notes play at the same time --> skip
      if (noteIndex > 0 && delay == 0) continue;
      else if (noteIndex > 0) commands.push(`delay(${delay});`);

      commands.push(
        `tone(PIEZO_PIN, NOTE_${note.name}, ${Math.floor(
          note.duration * 1000
        )});`
      );
    } else if (buzzers == 2) {
      // Dual buzzer

      //   If same track AND there is no delay --> skip
      if (note.trackId == previousNoteTrackId && delay == 0) continue;
      //   Else if not first note AND there is a delay
      else if (noteIndex > 0 && delay > 0) commands.push(`delay(${delay});`);

      commands.push(
        `tone(PIEZO_PIN_${note.trackId}, NOTE_${note.name}, ${Math.floor(
          note.duration * 1000
        )});`
      );
    }

    // Update previousNoteTrackId and previousNoteTime
    previousNoteTrackId = note.trackId;
    previousNoteTime = note.time;
  }

  commands.push("}");

  for (const command of commands) {
    $commands.val($commands.val() + command + "\n");
  }
}

// Generate Optimized Commands
function generateOptimized() {
  const commands = [];

  let previousNoteTime = 0;
  let previousNoteTrackId = -1;

  commands.push("const struct _tone song[] = {");

  for (const [noteIndex, note] of notes.entries()) {
    // Calculate the delay between the current note and the previous note
    const delay = Math.floor((note.time - previousNoteTime) * 1000);

    if (buzzers == 1) {
      // Single buzzer

      // If not first note AND there is no delay:
      // If the notes play at the same time --> skip
      if (noteIndex > 0 && delay == 0) continue;
      else if (noteIndex > 0) commands.push(`{0, 0, ${delay}},`);

      commands.push(
        `{PIEZO_PIN, NOTE_${note.name}, ${Math.floor(note.duration * 1000)}},`
      );
    } else if (buzzers == 2) {
      // Dual buzzer

      //   If same track AND there is no delay --> skip
      if (note.trackId == previousNoteTrackId && delay == 0) continue;
      //   Else if not first note AND there is a delay
      else if (noteIndex > 0 && delay > 0) commands.push(`{0, 0, ${delay}},`);

      commands.push(
        `{PIEZO_PIN_${note.trackId}, NOTE_${note.name}, ${Math.floor(
          note.duration * 1000
        )}},`
      );
    }

    // Update previousNoteTrackId and previousNoteTime
    previousNoteTrackId = note.trackId;
    previousNoteTime = note.time;
  }

  commands.push("};");

  for (const command of commands) {
    $commands.val($commands.val() + command + "\n");
  }
}

// Notes sorter function
function sortNotesByTimeAndFrequency(a, b) {
  // Note: If a > b, a will be placed later than b in the array

  // Notes contains all notes from all selected tracks

  // Want to sort them by time first, earlier notes show up first
  // If times are the same, sort by frequency, higher notes show up first

  // Higher notes generally sound better
  // In the generator function:
  // If there are multiple notes with the same time,
  // only the highest note will play

  if (a.time < b.time) {
    return -1;
  } else if (a.time > b.time) {
    return 1;
  }

  // If they have the same time
  if (frequenciesSort.indexOf(a.name) > frequenciesSort.indexOf(b.name)) {
    return -1;
  } else if (
    frequenciesSort.indexOf(a.name) < frequenciesSort.indexOf(b.name)
  ) {
    return 1;
  }

  // Will only be reached if notes exist on different tracks
  return a.trackId;
}
