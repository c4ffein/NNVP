<template>
  <div id="app">
    <div id="topBar" class="topBar"><TopBar/></div>
    <div id="leftBar" class="leftBar"><LeftBar/></div>
    <div id="whiteBoard" class="whiteBoard"><WhiteBoard/></div>
    <div id="rightBar" class="rightBar"><RightBar msg="Welcome to Your Vue.js App"/></div>
  </div>
</template>

<script>
import TopBar from './components/TopBar.vue';
import LeftBar from './components/LeftBar/LeftBar.vue';
import RightBar from './components/RightBar.vue';
import WhiteBoard from './components/WhiteBoard.vue';

export default {
  name: 'app',
  components: {
    TopBar,
    LeftBar,
    RightBar,
    WhiteBoard,
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
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'topBar topBar topBar'
    'leftBar whiteBoard rightBar';
  background-color: #FFFFFF;
  user-select: none;
  /* still needed for some details with safari */
  -webkit-user-select: none;
}
.topBar { grid-area: topBar; }
.leftBar { grid-area: leftBar; }
.rightBar { grid-area: rightBar; }
.whiteBoard { grid-area: whiteBoard; }

#app > div {
  background-color: rgba(255, 255, 255, 1);
  max-width: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  user-select: none;
}

#app > .topBar {
  height: 26px;
  width: 100%;
  background-color: rgba(240, 240, 240, 1);
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  text-align: center;
}

#app > .leftBar {
  width: 208px;
  overflow-y: auto;
  background-color: rgba(240, 240, 240, 1);
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  text-align: center;
  border-right: 1px solid rgba(100, 100, 100, 0.3);
}
#app > .rightBar {
  width: 223px;
  overflow-y: auto;
  background-color: rgba(240, 240, 240, 1);
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  text-align: center;
  color: #2c3e50;
  border-left: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(255, 255, 255, 0.8);
}
#app > .whiteBoard {
  max-width: 100%;
  max-height: 100%;
  background-color: rgba(200, 200, 200, 0.8);
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  text-align: center;
  color: #2c3e50;
}
</style>
