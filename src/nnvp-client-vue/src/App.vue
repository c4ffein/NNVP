<template>
  <div id="app">
    <div id="topBar" class="topBar"><TopBar @open-trainer="openTrainer"/></div>
    <div id="leftBar" class="leftBar"><LeftBar/></div>
    <div id="whiteBoard" class="whiteBoard"><WhiteBoard/></div>
    <div id="rightBar" class="rightBar"><RightBar msg="NNVP"/></div>
    <div id="bottomTrainer" class="bottomTrainer" v-bind:style="{height: trainerHeight+'vh'}">
      <BottomTrainer @close-trainer="closeTrainer"/>
    </div>
  </div>
</template>

<script>
import TopBar from './components/TopBar.vue';
import LeftBar from './components/LeftBar/LeftBar.vue';
import RightBar from './components/RightBar/RightBar.vue';
import WhiteBoard from './components/WhiteBoard.vue';
import BottomTrainer from './components/BottomTrainer.vue';

export default {
  name: 'app',
  components: {
    TopBar,
    LeftBar,
    RightBar,
    WhiteBoard,
    BottomTrainer,
  },
  methods: {
    openTrainer() {
      this.trainerOpenHeight = this.trainerOpenHeight > 25 ? this.trainerOpenHeight : 25;
      this.trainerHeight = this.trainerOpenHeight;
    },
    closeTrainer() {
      this.trainerHeight = 0;
    },
  },
  data() {
    return {
      trainerHeight: 0,
      trainerOpenHeight: 30,
    };
  },
};
</script>

<style>
@font-face {
  font-family: "Roboto Regular";
  src: url("./assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("./assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}

body,html {
  position: fixed; /* disable scroll bounce effect for Safari */
}

#app {
  height: 100vh;
  width: 100vw;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'topBar topBar topBar'
    'leftBar whiteBoard rightBar'
    'bottomTrainer bottomTrainer bottomTrainer';
  background-color: #FFFFFF;
  user-select: none;
  /* still needed for some details with safari */
  -webkit-user-select: none;
}
.topBar { grid-area: topBar; }
.leftBar { grid-area: leftBar; }
.rightBar { grid-area: rightBar; }
.whiteBoard { grid-area: whiteBoard; }
.bottomTrainer { grid-area: bottomTrainer; }

#app > div {
  background-color: rgba(255, 255, 255, 1);
  max-width: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  user-select: none;
  text-align: center;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
}

#app > .topBar {
  height: 26px;
  width: 100%;
  background-color: rgba(240, 240, 240, 1);
}

#app > .leftBar {
  width: 208px;
  overflow-y: auto;
  background-color: rgba(240, 240, 240, 1);
  border-right: 1px solid rgba(100, 100, 100, 0.3);
}
#app > .rightBar {
  width: 223px;
  overflow-y: auto;
  color: #2c3e50;
  border-left: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(255, 255, 255, 0.8);
}
#app > .whiteBoard {
  max-width: 100%;
  max-height: 100%;
  background-color: rgba(200, 200, 200, 0.8);
  color: #2c3e50;
}
#app > .bottomTrainer {
  width: 100%;
  overflow-y: auto;
  background-color: rgba(255, 255, 255, 1);
  color: #2c3e50;
}
button, input[type="button"], input[type="submit"], input, select {
  color: #000000;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  background-color: #FFFFFF;
  border: 1px solid;
  border-color: rgba(200,200,200,0.8);
}
input.arrows {
  color: #FFFFFF;
  background-color: #FFFFFF;
  border: 1px solid;
  border-color: rgba(200,200,200,0.8);
}
select {
  -webkit-appearance: none;
  appearance: none;
}
select:focus {
  outline-width: 0; /* not perfect but better */
}
select:-moz-focusring {
  color: transparent;
  text-shadow: 0 0 0 #000000;
}
option:not(:checked) {
  color: black; /* prevent <option>s from becoming transparent as well */
}
</style>
