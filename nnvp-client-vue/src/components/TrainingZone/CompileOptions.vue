<template>
  <div id="CompileOptions" class="CompileOptions">
    <!-- This div will be only the left part of this panel -->
    <div class="CompileOptions left-options-container">
      <div class="CompileOptions left-option" id="optimizer-selector">
        <!-- TODO : Optimizer parameters -->
        <div>Optimizer</div>
        <select
          v-bind:value="selectedOptimizer"
          v-on:change="$emit('changeSelectedOptimizer', $event.target.value)"
        >
          <option
            v-bind:key="optimizer"
            v-for="optimizer in selectableOptimizers"
            v-bind:value="optimizer"
          >
            {{optimizer}}
          </option>
        </select>
      </div>
      <div class="CompileOptions left-option" id="optimizer-selector2">
        <div>Epochs</div>
        <input
          type="number"
          v-bind:value="epochs"
          v-on:input="$emit('changeEpochs', Number($event.target.value))"
        />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CompileOptions',
  props: ['selectedOptimizer', 'selectableOptimizers', 'epochs'],
};
</script>

<style>
@font-face {
  font-family: var(--font-medium); font-weight: var(--font-weight-medium);
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#CompileOptions {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  overflow: hidden;
}
.CompileOptions.left-option{
  padding: 20px 10px 0px 10px;
}
.CompileOptions.left-option{
  display: grid;
  grid-template-columns: 75px 1fr;
}
.CompileOptions.left-option > div{
  text-align: left;
  margin-top: 2px;
  margin-right: 5px;
}
</style>
