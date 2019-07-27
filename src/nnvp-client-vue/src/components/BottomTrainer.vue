<template>
  <div id="BottomTrainer" class="BottomTrainer">
    Work in progress
    <button v-on:click="$emit('close-trainer')">╳</button>
  </div>
</template>

<script>
export default {
  name: 'BottomTrainer',
};
</script>

<style>
@font-face {
  font-family: "Roboto Regular";
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#BottomTrainer {
  height: 100%;
  cursor: default;
  font-family: "Roboto Thin";
  font-size: 15px;
  overflow: hidden;
  border-top: 1px solid rgba(100, 100, 100, 0.3);
}
</style>
