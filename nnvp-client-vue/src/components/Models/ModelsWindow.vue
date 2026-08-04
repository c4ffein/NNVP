<template>
  <FloatingWindow
    id="modelsWindow"
    title="Models"
    :initial="initialRect"
    window-id="models"
    :min-width="420"
    :min-height="300"
    @close="$emit('close')"
  >
    <div class="ModelsWindow">
      <div class="models-toolbar">
        <button
          type="button"
          class="models-view-list"
          :class="{ active: view === 'list' }"
          @click="view = 'list'"
        >Timeline</button>
        <button
          type="button"
          class="models-view-graph"
          :class="{ active: view === 'graph' }"
          @click="showGraph"
        >Graph</button>
        <button
          type="button"
          class="models-view-map"
          :class="{ active: view === 'map' }"
          @click="showMap"
        >Map</button>
        <button
          type="button"
          class="models-view-files"
          :class="{ active: view === 'files' }"
          @click="showFiles"
        >Files</button>
        <!-- ONE filter bar for both views — same dataset, same filters. -->
        <span class="models-filters">
          <input type="date" data-mfilter="from" v-model="rangeFrom" @change="selected = null" />
          <span class="models-filter-sep">→</span>
          <input type="date" data-mfilter="to" v-model="rangeTo" @change="selected = null" />
          <select data-mfilter="seen" v-model="seenMode" @change="selected = null">
            <option value="first">first iteration</option>
            <option value="last">last iteration</option>
          </select>
          <select data-mfilter="when" v-model="whenMode">
            <option value="absolute">exact time</option>
            <option value="relative">human time</option>
          </select>
          <button
            type="button"
            class="models-order"
            :title="order === 'newest' ? 'Newest first — click to invert' : 'Oldest first — click to invert'"
            @click="order = order === 'newest' ? 'oldest' : 'newest'; selected = null"
          >{{ order === 'newest' ? '↓ newest first' : '↑ oldest first' }}</button>
        </span>
      </div>
      <TimelinePanel
        v-if="view === 'list'"
        :listRuns="listRuns"
        :listSnapshots="listSnapshots"
        :whenMode="whenMode"
        :seenMode="seenMode"
        :range="range"
        :order="order"
        :scores="timelineScores"
      />
      <!-- The Files tab (Phase H5): a namespace over the models — strict
           folder tree, unix hard links to workHash "inodes", favorites is
           just /favorites. Cycles are impossible: no folder-links exist. -->
      <div v-else-if="view === 'files'" class="models-files">
        <!-- Saving mode: the Save-As flow — navigate, then "Save here". -->
        <div v-if="savingHash" class="files-saving-banner">
          Saving “{{ labelOfHash(savingHash) }}” —
          <button
            type="button"
            class="files-save-here"
            :disabled="filesPath === '/'"
            :title="filesPath === '/' ? 'Enter a folder first' : `Link into ${filesPath}`"
            @click="saveHere"
          >Save here</button>
          <button type="button" class="files-save-cancel" @click="savingHash = null">cancel</button>
        </div>
        <!-- The breadcrumb: every ancestor is one click away. -->
        <p class="files-crumbs">
          <button type="button" class="files-crumb" @click="filesPath = '/'">/</button>
          <template v-for="crumb in crumbs" :key="crumb.path">
            <button type="button" class="files-crumb" @click="filesPath = crumb.path">{{
              crumb.name }}</button><span class="files-crumb-sep">/</span>
          </template>
        </p>
        <div class="files-new">
          <input
            class="files-new-input"
            v-model="newFolderPath"
            placeholder="new folder name"
            @keyup.enter="createFolderFromInput"
          />
          <button type="button" class="files-new-btn" @click="createFolderFromInput">New folder</button>
        </div>
        <ul class="files-list">
          <li v-if="filesPath !== '/'" class="files-subfolder files-up" @click="goUp">
            <span class="files-subfolder-name">..</span>
          </li>
          <li
            v-for="name in subfolders"
            :key="name"
            class="files-subfolder"
            @click="enterFolder(name)"
          >
            <span class="files-subfolder-name">{{ name }}/</span>
            <button
              v-if="folderRemovable(name)"
              type="button"
              class="files-folder-remove"
              title="Remove empty folder"
              @click.stop="removeFolderAt(childPath(name))"
            >×</button>
          </li>
          <li v-for="hash in currentEntries" :key="hash" class="files-entry">
            <span class="files-entry-label">
              {{ labelOfHash(hash) }}
              <span v-if="ratingLine(hash)" class="files-entry-score"> · {{ ratingLine(hash) }}</span>
            </span>
            <button type="button" class="files-entry-load" @click="loadHash(hash)">Load</button>
            <button
              type="button"
              class="files-entry-remove"
              title="Remove this link (the model keeps its other links)"
              @click="unlinkAt(filesPath, hash)"
            >×</button>
          </li>
        </ul>
        <p v-if="!subfolders.length && !currentEntries.length" class="files-folder-empty">
          {{ filesPath === '/' ? 'No folders yet — create one above, or ★ a model.' : 'empty' }}
        </p>
      </div>
      <div v-else class="models-graph">
        <p v-if="loaded && !visibleNodes.length" class="models-empty">
          {{ graph.nodes.length
            ? 'No states in this date range.'
            : 'No model history yet — checkpoints (Ctrl+S) and training runs land here.' }}
        </p>
        <template v-else-if="visibleNodes.length">
          <div class="models-graph-canvas">
            <!-- The Map experiment: states as a 2D canvas-style graph, laid
                 out by the board's own autoLayout, each card a thumbnail of
                 its architecture. Same selection contract as the lane view. -->
            <svg
              v-if="view === 'map'"
              class="evolution-map"
              :class="{ panning: mapPanning }"
              :viewBox="mapViewBox"
              role="list"
              @wheel.prevent="onMapWheel"
              @pointerdown="onMapPanStart"
              @dblclick="fitMapView"
            >
              <!-- Coarsest level: nearby states melt into countable blobs;
                   clicking one dives back down a level. -->
              <template v-if="mapMode === 'clusters'">
                <line
                  v-for="edge in mapClusterEdges"
                  :key="edge.key"
                  class="map-edge map-cluster-edge"
                  :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
                />
                <g
                  v-for="cluster in mapClusters"
                  :key="cluster.ids[0]"
                  class="map-cluster"
                  role="listitem"
                  :transform="`translate(${cluster.x}, ${cluster.y}) scale(${1 / mapZoomK})`"
                  @click.stop="zoomToCluster(cluster)"
                  @pointerdown.stop
                >
                  <circle class="map-cluster-blob" :r="clusterRadius(cluster)" />
                  <text class="map-cluster-count" y="5">{{ cluster.ids.length }}</text>
                  <text class="map-cluster-label" :y="clusterRadius(cluster) + 16">{{
                    clusterLabel(cluster) }}</text>
                </g>
              </template>
              <template v-else>
              <line
                v-for="edge in mapEdges"
                :key="edge.key"
                class="map-edge"
                :class="[edge.laneClass, { dim: hoverId && !edgeTouchesHover(edge) }]"
                :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              />
              <g
                v-for="(node, index) in mapNodes"
                :key="node.docHash"
                class="evolution-map-node"
                :class="[`lane-${node.lane % 8}`, {
                  selected: index === selected,
                  dim: hoverId && !nearHover(node),
                }]"
                role="listitem"
                :transform="`translate(${node.mx}, ${node.my})`"
                @click="select(index)"
                @pointerdown.stop="onNodeDragStart(node, $event)"
                @mouseenter="hoverId = node.docHash"
                @mouseleave="hoverId = null"
              >
                <!-- Semantic zoom, Obsidian-style: from afar a weighted dot
                     (size = rating + activity), up close the thumbnail card. -->
                <template v-if="mapMode === 'dots'">
                  <circle class="map-dot" :r="dotRadius(node)" />
                  <text class="map-dot-label" :y="dotRadius(node) + 15">{{ shortLabel(node) }}</text>
                </template>
                <template v-else>
                  <rect
                    class="map-card"
                    :x="-MAP_NODE.width / 2" :y="-MAP_NODE.height / 2"
                    :width="MAP_NODE.width" :height="MAP_NODE.height" rx="8"
                  />
                  <svg
                    v-if="node.thumb"
                    class="map-thumb"
                    :x="-MAP_NODE.width / 2 + 8" :y="-MAP_NODE.height / 2 + 8"
                    :width="MAP_NODE.width - 16" :height="MAP_NODE.height - 40"
                    :viewBox="`${node.thumb.viewBox.x} ${node.thumb.viewBox.y} ${node.thumb.viewBox.width} ${node.thumb.viewBox.height}`"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <line
                      v-for="(line, i) in node.thumb.lines"
                      :key="'tl' + i"
                      :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
                    />
                    <rect
                      v-for="(box, i) in node.thumb.boxes"
                      :key="'tb' + i"
                      :x="box.x" :y="box.y" :width="box.width" :height="box.height" rx="10"
                    />
                  </svg>
                  <text
                    v-if="ratingLine(node.workHash)"
                    class="map-score"
                    :x="MAP_NODE.width / 2 - 6" :y="-MAP_NODE.height / 2 + 17"
                  >★{{ ratings.byHash.get(node.workHash)!.score }}</text>
                  <text class="map-label" x="0" :y="MAP_NODE.height / 2 - 20">{{
                    shortLabel(node) }}</text>
                  <text class="map-when" x="0" :y="MAP_NODE.height / 2 - 7">{{
                    whenOf(node) }}</text>
                </template>
              </g>
              </template>
            </svg>
            <svg v-else class="evolution-svg" :width="svgWidth" :height="svgHeight" role="list">
              <defs>
                <marker
                  id="evolution-arrow" viewBox="0 0 8 8" refX="6.5" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse"
                >
                  <path d="M0,0.8 L7,4 L0,7.2 z" class="evolution-arrowhead" />
                </marker>
              </defs>
              <!-- gitk-style routing: elbow into the child's lane right away,
                   then run DOWN the lane as a vertical rail — a long diagonal
                   would cut across every label between the rows. -->
              <path
                v-for="edge in edgeSegments"
                :key="edge.key"
                class="evolution-edge"
                :class="edge.laneClass"
                :d="edgePath(edge)"
                marker-end="url(#evolution-arrow)"
              />
              <g
                v-for="(node, index) in visibleNodes"
                :key="node.docHash"
                class="evolution-node"
                :class="[`lane-${node.lane % 8}`, { selected: index === selected }]"
                role="listitem"
                @click="select(index)"
              >
                <circle :cx="nodeX(node)" :cy="nodeY(node)" r="6.5" />
                <text :x="nodeX(node) + 14" :y="nodeY(node) + 4">{{ nodeLabel(node)
                  }}<tspan class="evolution-when"> · {{ whenOf(node) }}</tspan><tspan
                    v-if="ratingLine(node.workHash)"
                    class="evolution-score"> · {{ ratingLine(node.workHash) }}</tspan></text>
              </g>
            </svg>
          </div>
          <div v-if="selectedNode" class="models-detail">
            <div class="models-nav">
              <button type="button" class="models-prev" :disabled="selected === 0" @click="prev">←</button>
              <span class="models-detail-title">
                {{ selectedNode.summary || 'unnamed model' }}
                · {{ formatDate(selectedNode.firstSeen) }}
                · {{ selectedNode.checkpointCount }} checkpoint{{ selectedNode.checkpointCount === 1 ? '' : 's' }},
                {{ selectedNode.runCount }} run{{ selectedNode.runCount === 1 ? '' : 's' }}
                <template v-if="ratingLine(selectedNode.workHash)">
                  · {{ ratingLine(selectedNode.workHash) }}</template>
              </span>
              <button
                type="button"
                class="models-next"
                :disabled="selected === graph.nodes.length - 1"
                @click="next"
              >→</button>
              <button type="button" class="models-load" @click="loadSelected">Load this state</button>
            </div>
            <!-- The rating slider: your claim, verbatim, as a model.rated
                 event. Ranks derive across the field; claims never move. -->
            <div class="models-rating">
              <span class="models-rating-caption">How good, vs the others?</span>
              <input
                type="range"
                class="models-rating-slider"
                min="0" max="1000" step="10"
                :value="sliderValue"
                @change="onSliderChange"
              />
              <span class="models-rating-value">{{
                ratingLine(selectedNode.workHash) || 'unrated — slide to rate' }}</span>
              <button
                type="button"
                class="models-fav"
                :title="isFavorite ? 'Remove from /favorites' : 'Add to /favorites'"
                @click="toggleFavorite"
              >{{ isFavorite ? '★' : '☆' }}</button>
              <button type="button" class="models-save-to" @click="startSaveTo">save to…</button>
            </div>
            <p v-if="selectedInFolders.length" class="models-in-folders">
              in: {{ selectedInFolders.join(' · ') }}
            </p>
            <svg
              v-if="preview"
              class="models-preview"
              :viewBox="`${preview.viewBox.x} ${preview.viewBox.y} ${preview.viewBox.width} ${preview.viewBox.height}`"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker
                  id="preview-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse"
                >
                  <path d="M0,0.8 L7,4 L0,7.2 z" class="preview-arrowhead" />
                </marker>
              </defs>
              <template v-for="(line, index) in preview.lines" :key="'l' + index">
                <!-- Feedback edges arc below the row (bend from modelPreview) —
                     collinear-straight they'd vanish under the forward chain. -->
                <path
                  v-if="line.bend"
                  class="preview-edge"
                  :d="`M ${line.x1} ${line.y1} Q ${line.bend.x} ${line.bend.y} ${line.x2} ${line.y2}`"
                  marker-end="url(#preview-arrow)"
                />
                <line
                  v-else
                  class="preview-edge"
                  :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
                  marker-end="url(#preview-arrow)"
                />
              </template>
              <g v-for="(box, index) in preview.boxes" :key="'b' + index" class="preview-box">
                <rect :x="box.x" :y="box.y" :width="box.width" :height="box.height" rx="6" />
                <text :x="box.x + box.width / 2" :y="box.y + box.height / 2 + 4">{{ box.label }}</text>
              </g>
            </svg>
            <ul v-if="diffLines.length" class="models-diff">
              <li v-for="line in diffLines" :key="line">{{ line }}</li>
            </ul>
          </div>
        </template>
      </div>
    </div>
  </FloatingWindow>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import FloatingWindow from '../FloatingWindow.vue';
import TimelinePanel from '../TrainingZone/TimelinePanel.vue';
import autoLayout from '../../lib/AutoLayout/autoLayout';
import { simulate } from '../../lib/Training/forceLayout';
import { coarsen } from '../../lib/Training/coarsen';
import type { Cluster } from '../../lib/Training/coarsen';
import type { ForceNode } from '../../lib/Training/forceLayout';
import { listRuns as journalListRuns } from '../../lib/Training/runJournal';
import { listCheckpoints } from '../../lib/Training/checkpoints';
import { buildEvolutionGraph } from '../../lib/Training/evolutionGraph';
import type { EvolutionGraph, EvolutionInput, EvolutionNode } from '../../lib/Training/evolutionGraph';
import { previewLayout } from '../../lib/Training/modelPreview';
import type { PreviewLayout } from '../../lib/Training/modelPreview';
import { structuralDiff, describeDiff } from '../../lib/Training/structuralDiff';
import { formatWhen, inRange, pickSeen } from '../../lib/Training/modelsView';
import type { SeenMode, SeenRange, WhenMode } from '../../lib/Training/modelsView';
import { appendRating, foldRatings } from '../../lib/Training/modelRatings';
import {
  FAVORITES_PATH, createFolder, foldFolders, linkModel, removeFolder, unlinkModel,
} from '../../lib/Training/modelFolders';
import type { FolderTree } from '../../lib/Training/modelFolders';
import type { RatingTable } from '../../lib/Training/modelRatings';
import { listAllEvents } from '../../lib/Events/store';
import { getRecordStore } from '../../lib/LocalStore/db';
import type { FoldedRun } from '../../lib/Training/runEvents';
import type { NnvpModel } from '../../types/model';

// Commit-graph geometry: lanes fan right, rows run down.
const LANE_X = 28;
const ROW_Y = 44;
const ORIGIN = { x: 24, y: 26 };
// Non-reactive interaction state (the FloatingWindow pattern): pointer
// tracking mustn't churn Vue's reactivity per mousemove.
interface ModelsWindowInstanceExtra {
  mapPan?: { px: number; py: number; x: number; y: number; scale: number } | null;
  mapDrag?: {
    id: string; px: number; py: number; x: number; y: number; scale: number;
    moved: boolean; sim: ForceNode[]; edges: { source: string; target: string }[];
  } | null;
}

// Map cards: thumbnail on top, label + timestamp under it.
const MAP_NODE = { width: 150, height: 96 };
const MAP_PAD = 24;

/**
 * The Models window (Phase G3): the architecture story as its OWN document
 * window — deliberately outside the Training zone (training is bottom-docked
 * telemetry; this is something you study, usually maximized). Timeline list
 * view (the F3 panel, rehosted) plus the evolution graph: states by docHash,
 * edges from recorded parentage only, read-only preview, prev/next moving
 * the SELECTION — the one and only board mutation is the explicit
 * "Load this state" (the undoable loadGraphFromJSON path).
 * Owner component like TrainingZone: it reads the journal itself.
 */
export default defineComponent({
  name: 'ModelsWindow',
  components: { FloatingWindow, TimelinePanel },
  emits: ['close'],
  data() {
    return {
      MAP_NODE,
      view: 'list' as 'list' | 'graph' | 'map' | 'files',
      graph: { nodes: [], edges: [] } as EvolutionGraph,
      loaded: false,
      /** Index into visibleNodes (the filtered view), not graph.nodes. */
      selected: null as number | null,
      // The shared filter bar (both views): day-granular range + settings.
      rangeFrom: '',
      rangeTo: '',
      seenMode: 'first' as SeenMode,
      whenMode: 'absolute' as WhenMode,
      /** Display order for BOTH views; history reads best latest-first. */
      order: 'newest' as 'newest' | 'oldest',
      /** The pure fold over model.rated claims (latest per model + ranks). */
      ratings: { byHash: new Map(), rated: [] } as RatingTable,
      /** Physics-settled CENTER positions per docHash (the Map view). */
      mapPositions: {} as Record<string, { x: number; y: number }>,
      /** The Map camera (SVG viewBox) + its home width for the zoom factor. */
      mapView: { x: 0, y: 0, w: 900, h: 600 },
      mapBaseW: 900,
      mapPanning: false,
      /** Hovered map node — its neighborhood stays lit, the rest dims. */
      hoverId: null as string | null,
      /** The folder namespace fold (Phase H5). */
      folderTree: { folders: [], contents: new Map(), byModel: new Map() } as FolderTree,
      newFolderPath: '',
      /** Where the Files browser stands ('/' = root, holds no links). */
      filesPath: '/',
      /** The network being saved (Save-As mode); null = just browsing. */
      savingHash: null as string | null,
    };
  },
  mounted() {
    // Scores show in the timeline immediately — no need to visit Rate first.
    void this.loadRatings();
    void this.loadFolders();
  },
  watch: {
    // Filter/order changes reshape the visible set: re-settle the physics.
    visibleNodes() {
      if (this.view === 'map') this.rebuildMap();
    },
  },
  computed: {
    initialRect() {
      const width = Math.min(900, window.innerWidth - 120);
      const height = Math.min(560, window.innerHeight - 120);
      return {
        x: Math.max(20, (window.innerWidth - width) / 2),
        y: Math.max(20, (window.innerHeight - height) / 2),
        width,
        height,
      };
    },
    range(): SeenRange {
      return { from: this.rangeFrom || null, to: this.rangeTo || null };
    },
    /** The filter bar applied to the graph, rows recompacted for display —
     *  lanes keep their original assignment so branch structure stays legible. */
    visibleNodes(): (EvolutionNode & { displayRow: number })[] {
      const filtered = this.graph.nodes
        .filter(node => inRange(pickSeen(node.firstSeen, node.lastSeen, this.seenMode), this.range));
      if (this.order === 'newest') filtered.reverse();
      return filtered.map((node, displayRow) => ({ ...node, displayRow }));
    },
    selectedNode(): EvolutionNode | null {
      return this.selected === null ? null : this.visibleNodes[this.selected] ?? null;
    },
    /** The slider's position: the current claim, or midfield when unrated. */
    sliderValue(): number {
      const node = this.selectedNode;
      const rating = node ? this.ratings.byHash.get(node.workHash) : undefined;
      return rating ? rating.score : 500;
    },
    isFavorite(): boolean {
      const node = this.selectedNode;
      if (!node) return false;
      return (this.folderTree.byModel.get(node.workHash) ?? []).includes(FAVORITES_PATH);
    },
    /** The reverse lookup, read out loud: every folder holding this network. */
    selectedInFolders(): string[] {
      const node = this.selectedNode;
      return node ? this.folderTree.byModel.get(node.workHash) ?? [] : [];
    },
    crumbs(): { name: string; path: string }[] {
      if (this.filesPath === '/') return [];
      const segments = this.filesPath.split('/').filter(Boolean);
      return segments.map((name, index) => (
        { name, path: `/${segments.slice(0, index + 1).join('/')}` }));
    },
    /** Direct children of the current folder — including intermediate dirs
     *  implied by deeper paths ('/a/b/c' shows 'b' inside '/a'). */
    subfolders(): string[] {
      const prefix = this.filesPath === '/' ? '/' : `${this.filesPath}/`;
      const names = new Set<string>();
      for (const folder of this.folderTree.folders) {
        if (!folder.startsWith(prefix)) continue;
        const name = folder.slice(prefix.length).split('/')[0];
        if (name) names.add(name);
      }
      return [...names].sort();
    },
    /** Models hard-linked EXACTLY here (root can hold none by design). */
    currentEntries(): string[] {
      return this.folderTree.contents.get(this.filesPath) ?? [];
    },
    /** One representative state per NETWORK (workHash): its latest docHash. */
    workGroups(): Map<string, EvolutionNode> {
      const groups = new Map<string, EvolutionNode>();
      for (const node of this.graph.nodes) {
        const existing = groups.get(node.workHash);
        if (!existing || (node.lastSeen ?? '') > (existing.lastSeen ?? '')) {
          groups.set(node.workHash, node);
        }
      }
      return groups;
    },
    /** The timeline's score column: workHash → {score, rank}. */
    timelineScores(): Record<string, { score: number; rank: number; total: number }> {
      const scores: Record<string, { score: number; rank: number; total: number }> = {};
      for (const rating of this.ratings.rated) {
        scores[rating.workHash] = {
          score: rating.score, rank: rating.rank, total: this.ratings.rated.length,
        };
      }
      return scores;
    },
    /** The Map tab: physics positions (mapPositions) merged onto the
     *  filtered nodes. Index-aligned with visibleNodes so selection/prev/
     *  next/Load share one contract across views. Positions are CENTERS. */
    mapNodes(): (EvolutionNode & { displayRow: number; mx: number; my: number; thumb: PreviewLayout | null })[] {
      return this.visibleNodes.map((node) => {
        const at = this.mapPositions[node.docHash] ?? { x: 0, y: 0 };
        return {
          ...node, mx: at.x, my: at.y, thumb: previewLayout(node.graphJson),
        };
      });
    },
    mapViewBox(): string {
      const view = this.mapView;
      return `${view.x} ${view.y} ${view.w} ${view.h}`;
    },
    mapZoomK(): number {
      return this.mapBaseW / this.mapView.w;
    },
    /** Below this zoom the cards coarsen into weighted dots. */
    mapZoomedOut(): boolean {
      return this.mapZoomK < 0.65;
    },
    /** The zoom ladder: cards → dots → coarsened cluster blobs. */
    mapMode(): 'cards' | 'dots' | 'clusters' {
      if (this.mapZoomK < 0.4) return 'clusters';
      return this.mapZoomK < 0.65 ? 'dots' : 'cards';
    },
    /** Far-view coarsening: merge radius grows as the camera pulls back. */
    mapClusters(): Cluster[] {
      if (this.mapMode !== 'clusters') return [];
      const radius = 100 / Math.max(0.05, this.mapZoomK);
      return coarsen(
        this.visibleNodes.map(node => ({
          id: node.docHash,
          x: this.mapPositions[node.docHash]?.x ?? 0,
          y: this.mapPositions[node.docHash]?.y ?? 0,
        })),
        radius,
      );
    },
    /** Lineage edges lifted to cluster level (deduped, no self-loops). */
    mapClusterEdges(): { key: string; x1: number; y1: number; x2: number; y2: number }[] {
      if (this.mapMode !== 'clusters') return [];
      const clusterOf = new Map<string, Cluster>();
      this.mapClusters.forEach((cluster) => {
        cluster.ids.forEach(id => clusterOf.set(id, cluster));
      });
      const seen = new Set<string>();
      const lifted: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const edge of this.graph.edges) {
        const from = clusterOf.get(edge.from);
        const to = clusterOf.get(edge.to);
        if (!from || !to || from === to) continue;
        const key = `${from.ids[0]}>${to.ids[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lifted.push({ key, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
      return lifted;
    },
    hoverNeighborSet(): Set<string> {
      const neighbors = new Set<string>();
      if (this.hoverId === null) return neighbors;
      neighbors.add(this.hoverId);
      for (const edge of this.graph.edges) {
        if (edge.from === this.hoverId) neighbors.add(edge.to);
        if (edge.to === this.hoverId) neighbors.add(edge.from);
      }
      return neighbors;
    },
    mapEdges(): { key: string; laneClass: string; from: string; to: string; x1: number; y1: number; x2: number; y2: number }[] {
      const byHash = new Map(this.mapNodes.map(node => [node.docHash, node]));
      return this.graph.edges.flatMap((edge) => {
        const from = byHash.get(edge.from);
        const to = byHash.get(edge.to);
        if (!from || !to) return []; // filtered endpoints: no dangling edges
        return [{
          key: `${edge.from}>${edge.to}`,
          laneClass: `lane-${to.lane % 8}`, // an edge belongs to its child's branch
          from: edge.from,
          to: edge.to,
          x1: from.mx,
          y1: from.my,
          x2: to.mx,
          y2: to.my,
        }];
      });
    },

    preview(): PreviewLayout | null {
      return this.selectedNode === null ? null : previewLayout(this.selectedNode.graphJson);
    },
    /** The selected state's changes vs its recorded parent. */
    diffLines(): string[] {
      const node = this.selectedNode;
      if (node === null || node.parent === null) return [];
      const parent = this.graph.nodes.find(candidate => candidate.docHash === node.parent);
      if (!parent) return [];
      try {
        const before = JSON.parse(parent.graphJson) as NnvpModel;
        const after = JSON.parse(node.graphJson) as NnvpModel;
        return describeDiff(structuralDiff(before, after));
      } catch {
        return [];
      }
    },
    svgWidth(): number {
      const lanes = Math.max(0, ...this.visibleNodes.map(node => node.lane)) + 1;
      // Size the label gutter to the longest label actually shown (~6.6px per
      // character at 12px) — a fixed allowance clipped the deep conv chains.
      const longest = Math.max(0, ...this.visibleNodes.map(
        node => this.nodeLabel(node).length + 22, // + the timestamp tspan
      ));
      return ORIGIN.x + lanes * LANE_X + 20 + Math.ceil(longest * 6.6);
    },
    svgHeight(): number {
      return ORIGIN.y + this.visibleNodes.length * ROW_Y;
    },
    edgeSegments(): {
      key: string; laneClass: string; x1: number; y1: number; x2: number; y2: number;
    }[] {
      const byHash = new Map(this.visibleNodes.map(node => [node.docHash, node]));
      return this.graph.edges.flatMap((edge) => {
        const from = byHash.get(edge.from);
        const to = byHash.get(edge.to);
        if (!from || !to) return []; // filtered endpoints: no dangling edges
        return [{
          key: `${edge.from}>${edge.to}`,
          laneClass: `lane-${to.lane % 8}`, // an edge belongs to its child's branch
          x1: this.nodeX(from),
          y1: this.nodeY(from),
          x2: this.nodeX(to),
          y2: this.nodeY(to),
        }];
      });
    },
  },
  methods: {
    /** TimelinePanel's prop — the same journal listing TrainingZone hands out. */
    listRuns(options?: { includeHidden?: boolean }): Promise<FoldedRun[]> {
      return journalListRuns(getRecordStore(), options);
    },
    /** Checkpoints join the timeline as snapshots (graphJson + wall time). */
    async listSnapshots(): Promise<{ graphJson: string; at: string | null }[]> {
      return (await listCheckpoints(getRecordStore()))
        .map(checkpoint => ({ graphJson: checkpoint.graphJson, at: checkpoint.at }));
    },
    async showGraph(): Promise<void> {
      this.view = 'graph';
      await this.refreshGraph();
    },
    async showMap(): Promise<void> {
      this.view = 'map';
      await this.refreshGraph();
      this.rebuildMap();
    },
    /**
     * Settle the physics: seed from autoLayout (lineage structure survives
     * the organic look), keep any positions the user already dragged, relax.
     */
    rebuildMap(): void {
      const nodes = this.visibleNodes;
      if (!nodes.length) return;
      const visible = new Set(nodes.map(node => node.docHash));
      const edges = this.graph.edges
        .filter(edge => visible.has(edge.from) && visible.has(edge.to))
        .map(edge => ({ source: edge.from, target: edge.to }));
      const seeded = autoLayout({
        nodes: nodes.map(node => ({ id: node.docHash, x: 0, y: 0, ...MAP_NODE })),
        edges,
      }, { hGap: 70, vGap: 40 });
      const sim: ForceNode[] = nodes.map((node) => {
        const kept = this.mapPositions[node.docHash];
        const seed = seeded.get(node.docHash)!;
        return {
          id: node.docHash,
          x: kept?.x ?? seed.x + MAP_NODE.width / 2,
          y: kept?.y ?? seed.y + MAP_NODE.height / 2,
          vx: 0,
          vy: 0,
        };
      });
      simulate(sim, edges, 400);
      this.mapPositions = Object.fromEntries(sim.map(node => [node.id, { x: node.x, y: node.y }]));
      this.fitMapView();
    },
    /** Frame everything with a margin; this becomes zoom factor 1. */
    fitMapView(): void {
      const positions = Object.values(this.mapPositions);
      if (!positions.length) return;
      const margin = 140;
      const minX = Math.min(...positions.map(at => at.x)) - margin;
      const minY = Math.min(...positions.map(at => at.y)) - margin;
      const maxX = Math.max(...positions.map(at => at.x)) + margin;
      const maxY = Math.max(...positions.map(at => at.y)) + margin;
      this.mapView = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      this.mapBaseW = this.mapView.w;
    },
    onMapWheel(event: WheelEvent): void {
      // macOS-native split: two-finger scroll WANDERS the map; pinch (which
      // browsers deliver as ctrl+wheel) and ctrl/meta+wheel ZOOM.
      if (!event.ctrlKey && !event.metaKey) {
        const rect = (event.currentTarget as Element | null)?.getBoundingClientRect?.();
        const scale = rect && rect.width ? this.mapView.w / rect.width : 1;
        this.mapView = {
          ...this.mapView,
          x: this.mapView.x + event.deltaX * scale,
          y: this.mapView.y + event.deltaY * scale,
        };
        return;
      }
      const factor = Math.exp(-event.deltaY * 0.0015);
      const view = this.mapView;
      const newW = Math.min(this.mapBaseW * 4, Math.max(this.mapBaseW / 6, view.w / factor));
      const newH = newW * (view.h / view.w);
      // Zoom toward the cursor. Synthetic events (tests) carry (0,0) — treat
      // that as "no pointer" and anchor at the center, or the camera drifts.
      const rect = (event.currentTarget as Element | null)?.getBoundingClientRect?.();
      const hasPointer = Boolean(event.clientX || event.clientY);
      const px = rect && rect.width && hasPointer
        ? (event.clientX - rect.left) / rect.width : 0.5;
      const py = rect && rect.height && hasPointer
        ? (event.clientY - rect.top) / rect.height : 0.5;
      this.mapView = {
        x: view.x + (view.w - newW) * px,
        y: view.y + (view.h - newH) * py,
        w: newW,
        h: newH,
      };
    },
    /** World units per CSS pixel — converts pointer deltas for pan/drag. */
    mapScale(event: PointerEvent): number {
      const svg = (event.currentTarget as Element | null)?.closest?.('.evolution-map')
        ?? document.querySelector('.evolution-map');
      const rect = svg?.getBoundingClientRect?.();
      return rect && rect.width ? this.mapView.w / rect.width : 1;
    },
    onMapPanStart(event: PointerEvent): void {
      if (event.button !== undefined && event.button !== 0) return;
      const self = this as unknown as ModelsWindowInstanceExtra;
      self.mapPan = {
        px: event.clientX, py: event.clientY, x: this.mapView.x, y: this.mapView.y,
        scale: this.mapScale(event),
      };
      this.mapPanning = true;
      window.addEventListener('pointermove', this.onMapPanMove);
      window.addEventListener('pointerup', this.onMapPanEnd);
    },
    onMapPanMove(event: PointerEvent): void {
      const pan = (this as unknown as ModelsWindowInstanceExtra).mapPan;
      if (!pan) return;
      this.mapView = {
        ...this.mapView,
        x: pan.x - (event.clientX - pan.px) * pan.scale,
        y: pan.y - (event.clientY - pan.py) * pan.scale,
      };
    },
    onMapPanEnd(): void {
      (this as unknown as ModelsWindowInstanceExtra).mapPan = null;
      this.mapPanning = false;
      window.removeEventListener('pointermove', this.onMapPanMove);
      window.removeEventListener('pointerup', this.onMapPanEnd);
    },
    onNodeDragStart(node: EvolutionNode, event: PointerEvent): void {
      if (event.button !== undefined && event.button !== 0) return;
      const self = this as unknown as ModelsWindowInstanceExtra;
      const visible = new Set(this.visibleNodes.map(candidate => candidate.docHash));
      const sim: ForceNode[] = this.visibleNodes.map(candidate => ({
        id: candidate.docHash,
        x: this.mapPositions[candidate.docHash]?.x ?? 0,
        y: this.mapPositions[candidate.docHash]?.y ?? 0,
        vx: 0,
        vy: 0,
        fixed: candidate.docHash === node.docHash,
      }));
      self.mapDrag = {
        id: node.docHash,
        px: event.clientX,
        py: event.clientY,
        x: this.mapPositions[node.docHash]?.x ?? 0,
        y: this.mapPositions[node.docHash]?.y ?? 0,
        scale: this.mapScale(event),
        moved: false,
        sim,
        edges: this.graph.edges
          .filter(edge => visible.has(edge.from) && visible.has(edge.to))
          .map(edge => ({ source: edge.from, target: edge.to })),
      };
      window.addEventListener('pointermove', this.onNodeDragMove);
      window.addEventListener('pointerup', this.onNodeDragEnd);
    },
    onNodeDragMove(event: PointerEvent): void {
      const drag = (this as unknown as ModelsWindowInstanceExtra).mapDrag;
      if (!drag) return;
      drag.moved = true;
      const dragged = drag.sim.find(node => node.id === drag.id)!;
      dragged.x = drag.x + (event.clientX - drag.px) * drag.scale;
      dragged.y = drag.y + (event.clientY - drag.py) * drag.scale;
      // The neighborhood answers the pull — Obsidian's elasticity.
      simulate(drag.sim, drag.edges, 3);
      this.mapPositions = Object.fromEntries(
        drag.sim.map(node => [node.id, { x: node.x, y: node.y }]),
      );
    },
    onNodeDragEnd(): void {
      const self = this as unknown as ModelsWindowInstanceExtra;
      const drag = self.mapDrag;
      self.mapDrag = null;
      window.removeEventListener('pointermove', this.onNodeDragMove);
      window.removeEventListener('pointerup', this.onNodeDragEnd);
      if (!drag || !drag.moved) return;
      const dragged = drag.sim.find(node => node.id === drag.id)!;
      dragged.fixed = false;
      simulate(drag.sim, drag.edges, 60);
      this.mapPositions = Object.fromEntries(
        drag.sim.map(node => [node.id, { x: node.x, y: node.y }]),
      );
    },
    clusterLabel(cluster: Cluster): string {
      if (cluster.ids.length === 1) {
        const node = this.visibleNodes.find(candidate => candidate.docHash === cluster.ids[0]);
        return node ? this.shortLabel(node) : '1 model';
      }
      return `${cluster.ids.length} models`;
    },
    clusterRadius(cluster: Cluster): number {
      return 16 + 7 * Math.sqrt(cluster.ids.length);
    },
    /** Clicking a blob dives into it — the semantic-zoom descent. */
    zoomToCluster(cluster: Cluster): void {
      const view = this.mapView;
      const newW = Math.max(this.mapBaseW / 6, view.w / 2.4);
      const newH = newW * (view.h / view.w);
      this.mapView = {
        x: cluster.x - newW / 2, y: cluster.y - newH / 2, w: newW, h: newH,
      };
    },
    /** Dot size from afar: activity + the user's rating, Obsidian-weighted. */
    dotRadius(node: EvolutionNode): number {
      const activity = Math.min(8, node.runCount + node.checkpointCount);
      const rating = this.ratings.byHash.get(node.workHash)?.score ?? 0;
      return 9 + activity + rating / 150;
    },
    nearHover(node: EvolutionNode): boolean {
      return this.hoverNeighborSet.has(node.docHash);
    },
    edgeTouchesHover(edge: { from: string; to: string }): boolean {
      return edge.from === this.hoverId || edge.to === this.hoverId;
    },
    // --- Folders (Phase H5) -----------------------------------------------
    async showFiles(): Promise<void> {
      this.view = 'files';
      await this.refreshGraph(); // labels need the states' identities
      await this.loadFolders();
    },
    async loadFolders(): Promise<void> {
      this.folderTree = foldFolders(await listAllEvents(getRecordStore()));
    },
    childPath(name: string): string {
      return this.filesPath === '/' ? `/${name}` : `${this.filesPath}/${name}`;
    },
    enterFolder(name: string): void {
      this.filesPath = this.childPath(name);
    },
    goUp(): void {
      const segments = this.filesPath.split('/').filter(Boolean);
      segments.pop();
      this.filesPath = segments.length ? `/${segments.join('/')}` : '/';
    },
    /** A subfolder is removable only when nothing lives at or below it. */
    folderRemovable(name: string): boolean {
      const full = this.childPath(name);
      const hasDescendants = this.folderTree.folders.some(folder => folder.startsWith(`${full}/`));
      return !hasDescendants && (this.folderTree.contents.get(full) ?? []).length === 0;
    },
    async createFolderFromInput(): Promise<void> {
      const name = this.newFolderPath.trim();
      if (!name || name.includes('/')) return; // one segment, under the current folder
      if (await createFolder(this.childPath(name))) {
        this.newFolderPath = '';
        await this.loadFolders();
      }
    },
    async removeFolderAt(path: string): Promise<void> {
      await removeFolder(path);
      await this.loadFolders();
    },
    async unlinkAt(path: string, workHash: string): Promise<void> {
      await unlinkModel(path, workHash);
      await this.loadFolders();
    },
    async toggleFavorite(): Promise<void> {
      const node = this.selectedNode;
      if (!node) return;
      if (this.isFavorite) await unlinkModel(FAVORITES_PATH, node.workHash);
      else await linkModel(FAVORITES_PATH, node.workHash);
      await this.loadFolders();
    },
    /** The Save-As flow: remember what we are saving, browse for a home. */
    async startSaveTo(): Promise<void> {
      const node = this.selectedNode;
      if (!node) return;
      this.savingHash = node.workHash;
      await this.showFiles();
    },
    async saveHere(): Promise<void> {
      if (this.savingHash === null || this.filesPath === '/') return;
      await linkModel(this.filesPath, this.savingHash);
      this.savingHash = null;
      await this.loadFolders();
    },
    labelOfHash(workHash: string): string {
      return this.workGroups.get(workHash)?.summary || workHash.slice(0, 8);
    },
    /** Loading from Files rides the same undoable restore as everywhere. */
    loadHash(workHash: string): void {
      const node = this.workGroups.get(workHash);
      if (node) void this.$boardInterface.loadGraphFromJSON(node.graphJson);
    },
    // --- Rating (Phase H3, the slider) ------------------------------------
    async loadRatings(): Promise<void> {
      this.ratings = foldRatings(await listAllEvents(getRecordStore()));
    },
    onSliderChange(event: Event): void {
      void this.rateSelected((event.target as HTMLInputElement).valueAsNumber);
    },
    /** One claim event for the selected state's NETWORK (workHash). */
    async rateSelected(score: number): Promise<void> {
      if (this.selectedNode === null || !Number.isFinite(score)) return;
      await appendRating(this.selectedNode.workHash, score);
      await this.loadRatings();
    },
    /** "★ 812 (#2/9)" — or '' when unrated. */
    ratingLine(workHash: string | null | undefined): string {
      const rating = workHash ? this.ratings.byHash.get(workHash) : undefined;
      if (!rating) return '';
      return `★ ${rating.score} (#${rating.rank}/${this.ratings.rated.length})`;
    },
    shortLabel(node: EvolutionNode): string {
      const label = this.nodeLabel(node);
      return label.length > 22 ? `${label.slice(0, 21)}…` : label;
    },
    async refreshGraph(): Promise<void> {
      const store = getRecordStore();
      const [runs, checkpoints] = await Promise.all([
        journalListRuns(store, { includeHidden: true }),
        listCheckpoints(store),
      ]);
      const inputs: EvolutionInput[] = [
        ...checkpoints.map((checkpoint): EvolutionInput => ({
          graphJson: checkpoint.graphJson,
          parent: checkpoint.parent,
          seenAt: checkpoint.at,
          kind: 'checkpoint',
          ref: checkpoint.uuid,
        })),
        ...runs.flatMap((run): EvolutionInput[] => (run.graphJson === null ? [] : [{
          graphJson: run.graphJson,
          parent: run.parent,
          seenAt: run.startedAt ?? run.lastEventAt,
          kind: 'run',
          ref: run.uuid,
        }])),
      ];
      this.graph = await buildEvolutionGraph(inputs);
      this.loaded = true;
      if (this.selected !== null && this.selected >= this.visibleNodes.length) this.selected = null;
    },
    nodeX(node: EvolutionNode): number {
      return ORIGIN.x + node.lane * LANE_X;
    },
    /** Same lane: straight rail. Cross-lane: a short elbow curve into the
     *  child's lane, then the vertical rail. Direction-agnostic — with
     *  newest-first order the child sits ABOVE its parent, the rail runs up. */
    edgePath(edge: { x1: number; y1: number; x2: number; y2: number }): string {
      const down = edge.y2 >= edge.y1; // child below (oldest-first) or above
      const sign = down ? 1 : -1;
      const start = edge.y1 + 8 * sign;
      const end = edge.y2 - 9 * sign;
      if (edge.x1 === edge.x2) return `M ${edge.x1} ${start} L ${edge.x2} ${end}`;
      const elbow = edge.y1 + 26 * sign;
      const railTop = down ? Math.min(edge.y1 + 36, end) : Math.max(edge.y1 - 36, end);
      return `M ${edge.x1} ${start} C ${edge.x1} ${elbow}, ${edge.x2} ${elbow}, `
        + `${edge.x2} ${railTop} L ${edge.x2} ${end}`;
    },
    nodeY(node: EvolutionNode & { displayRow: number }): number {
      return ORIGIN.y + node.displayRow * ROW_Y;
    },
    nodeLabel(node: EvolutionNode): string {
      return node.label || node.summary || 'unnamed model';
    },
    whenOf(node: EvolutionNode): string {
      return formatWhen(
        pickSeen(node.firstSeen, node.lastSeen, this.seenMode), this.whenMode, Date.now(),
      );
    },
    formatDate(iso: string | null): string {
      if (!iso) return '—';
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
    },
    select(index: number): void {
      this.selected = index;
    },
    next(): void {
      if (this.selected !== null && this.selected < this.visibleNodes.length - 1) this.selected += 1;
    },
    prev(): void {
      if (this.selected !== null && this.selected > 0) this.selected -= 1;
    },
    /** The one board mutation in this window — the undoable restore path. */
    loadSelected(): void {
      if (this.selectedNode === null) return;
      void this.$boardInterface.loadGraphFromJSON(this.selectedNode.graphJson);
    },
  },
});
</script>

<style>
.ModelsWindow {
  flex: 1;
  min-height: 0;
  position: relative; /* the rating overlay anchors to the window body */
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.models-toolbar {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--panel-border);
}
.models-toolbar button {
  font: inherit;
  font-size: 12px;
  padding: 2px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.models-toolbar button.active {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.models-filters {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.models-filters input,
.models-filters select {
  font: inherit;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 1px 4px;
}
.models-filter-sep { color: var(--text-muted); }
.models-order {
  font: inherit;
  font-size: 12px;
  padding: 1px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.models-order:hover { color: var(--text-primary); background: var(--bg-hover); }
/* Split pane: the GRAPH scrolls, the detail strip below stays put — a
   preview that scrolls away with the list is no preview at all. */
.models-graph {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 16px;
}
.models-empty { margin: 0; color: var(--text-muted); max-width: 640px; }
.models-graph-canvas { flex: 1 1 auto; min-height: 0; overflow: auto; }
/* Commit-graph lanes: each branch keeps a color; edges wear their child's. */
.evolution-svg {
  --lane-0: #4e79a7; --lane-1: #f28e2b; --lane-2: #59a14f; --lane-3: #e15759;
  --lane-4: #b07aa1; --lane-5: #76b7b2; --lane-6: #edc948; --lane-7: #af7aa1;
}
.evolution-edge { stroke: var(--panel-border); stroke-width: 2; fill: none; opacity: 0.8; }
.evolution-edge.lane-0 { stroke: var(--lane-0); }
.evolution-edge.lane-1 { stroke: var(--lane-1); }
.evolution-edge.lane-2 { stroke: var(--lane-2); }
.evolution-edge.lane-3 { stroke: var(--lane-3); }
.evolution-edge.lane-4 { stroke: var(--lane-4); }
.evolution-edge.lane-5 { stroke: var(--lane-5); }
.evolution-edge.lane-6 { stroke: var(--lane-6); }
.evolution-edge.lane-7 { stroke: var(--lane-7); }
/* Arrowheads pick up the edge's own stroke color. */
.evolution-arrowhead { fill: context-stroke; }
.evolution-node { cursor: pointer; }
.evolution-node circle {
  fill: var(--text-muted);
  stroke: var(--bg-elevated);
  stroke-width: 2;
}
.evolution-node.lane-0 circle { fill: var(--lane-0); }
.evolution-node.lane-1 circle { fill: var(--lane-1); }
.evolution-node.lane-2 circle { fill: var(--lane-2); }
.evolution-node.lane-3 circle { fill: var(--lane-3); }
.evolution-node.lane-4 circle { fill: var(--lane-4); }
.evolution-node.lane-5 circle { fill: var(--lane-5); }
.evolution-node.lane-6 circle { fill: var(--lane-6); }
.evolution-node.lane-7 circle { fill: var(--lane-7); }
.evolution-node.selected circle {
  stroke: var(--accent);
  stroke-width: 3;
}
/* Halo: labels stay readable where a lane rail runs behind them. */
.evolution-node text {
  fill: var(--text-primary);
  font-size: 12px;
  paint-order: stroke;
  stroke: var(--bg-elevated);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.evolution-when { fill: var(--text-muted); font-size: 11px; }
/* The Map tab: canvas-style cards. Edges reuse the lane palette. */
.map-edge { stroke: var(--panel-border); stroke-width: 2; }
.map-edge.lane-0 { stroke: var(--lane-0); }
.map-edge.lane-1 { stroke: var(--lane-1); }
.map-edge.lane-2 { stroke: var(--lane-2); }
.map-edge.lane-3 { stroke: var(--lane-3); }
.map-edge.lane-4 { stroke: var(--lane-4); }
.map-edge.lane-5 { stroke: var(--lane-5); }
.map-edge.lane-6 { stroke: var(--lane-6); }
.map-edge.lane-7 { stroke: var(--lane-7); }
.evolution-map {
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.evolution-map.panning { cursor: grabbing; }
.map-dot {
  fill: var(--text-muted);
  stroke: var(--bg-elevated);
  stroke-width: 2;
}
.evolution-map-node.lane-0 .map-dot { fill: var(--lane-0); }
.evolution-map-node.lane-1 .map-dot { fill: var(--lane-1); }
.evolution-map-node.lane-2 .map-dot { fill: var(--lane-2); }
.evolution-map-node.lane-3 .map-dot { fill: var(--lane-3); }
.evolution-map-node.lane-4 .map-dot { fill: var(--lane-4); }
.evolution-map-node.lane-5 .map-dot { fill: var(--lane-5); }
.evolution-map-node.lane-6 .map-dot { fill: var(--lane-6); }
.evolution-map-node.lane-7 .map-dot { fill: var(--lane-7); }
.evolution-map-node.selected .map-dot { stroke: var(--accent); stroke-width: 3; }
.map-dot-label {
  fill: var(--text-primary);
  font-size: 12px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--bg-elevated);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.evolution-map-node, .map-edge { transition: opacity 0.15s ease; }
.evolution-map-node.dim, .map-edge.dim { opacity: 0.12; }
.map-cluster { cursor: zoom-in; }
.map-cluster-blob {
  fill: color-mix(in srgb, var(--accent) 22%, var(--bg-elevated));
  stroke: var(--accent);
  stroke-width: 2;
}
.map-cluster-count {
  fill: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  text-anchor: middle;
}
.map-cluster-label {
  fill: var(--text-muted);
  font-size: 12px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--bg-elevated);
  stroke-width: 3px;
}
.map-cluster-edge { stroke: var(--panel-border); opacity: 0.6; }
/* The map's lane palette (the commit graph carries its own copy). */
.evolution-map {
  --lane-0: #4e79a7; --lane-1: #f28e2b; --lane-2: #59a14f; --lane-3: #e15759;
  --lane-4: #b07aa1; --lane-5: #76b7b2; --lane-6: #edc948; --lane-7: #af7aa1;
}
.evolution-map-node { cursor: pointer; }
.map-card {
  fill: var(--bg-elevated);
  stroke: var(--panel-border);
  stroke-width: 1.5;
}
.evolution-map-node.lane-0 .map-card { stroke: var(--lane-0); }
.evolution-map-node.lane-1 .map-card { stroke: var(--lane-1); }
.evolution-map-node.lane-2 .map-card { stroke: var(--lane-2); }
.evolution-map-node.lane-3 .map-card { stroke: var(--lane-3); }
.evolution-map-node.lane-4 .map-card { stroke: var(--lane-4); }
.evolution-map-node.lane-5 .map-card { stroke: var(--lane-5); }
.evolution-map-node.lane-6 .map-card { stroke: var(--lane-6); }
.evolution-map-node.lane-7 .map-card { stroke: var(--lane-7); }
.evolution-map-node.selected .map-card { stroke: var(--accent); stroke-width: 3; }
.map-thumb line { stroke: var(--text-muted); stroke-width: 4; }
.map-thumb rect {
  fill: var(--bg-hover);
  stroke: var(--text-muted);
  stroke-width: 3;
}
.map-label {
  fill: var(--text-primary);
  font-size: 11px;
  text-anchor: middle;
}
.map-when {
  fill: var(--text-muted);
  font-size: 9px;
  text-anchor: middle;
}
.map-score {
  fill: var(--accent);
  font-size: 10px;
  font-weight: 600;
  text-anchor: end;
}
.evolution-score { fill: var(--accent); font-size: 11px; }
.models-detail {
  /* The fixed bottom third: never taller than ~40% of the pane, its own
     scrollbar when a diff list runs long. */
  flex: 0 0 auto;
  max-height: 40%;
  overflow-y: auto;
  border-top: 1px solid var(--panel-border);
  margin-top: 10px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.models-nav { display: flex; align-items: center; gap: 8px; }
.models-nav button {
  font: inherit;
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.models-nav button:disabled { color: var(--text-muted); cursor: default; }
.models-detail-title { flex: 1; color: var(--text-muted); }
.models-preview {
  flex: 1;
  min-height: 120px;
  max-height: 260px;
  width: 100%;
}
.preview-edge { stroke: var(--text-muted); stroke-width: 2; fill: none; }
.preview-arrowhead { fill: var(--text-muted); }
.preview-box rect {
  fill: var(--bg-elevated);
  stroke: var(--panel-border);
  stroke-width: 1.5;
}
.preview-box text {
  fill: var(--text-primary);
  font-size: 12px;
  text-anchor: middle;
}
.models-diff {
  margin: 0;
  padding-left: 18px;
  color: var(--text-muted);
}
/* The Files tab: quiet folder tree, entries as rows. */
.models-files {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px;
  font-size: 13px;
  text-align: left;
}
.files-new { display: flex; gap: 8px; margin-bottom: 12px; }
.files-new-input {
  flex: 0 1 320px;
  font: inherit;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 2px 6px;
}
.files-new-btn, .files-entry-load {
  font: inherit;
  font-size: 12px;
  padding: 2px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.files-folder { margin-bottom: 10px; }
.files-folder-name {
  margin: 0 0 4px;
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.files-folder-remove, .files-entry-remove {
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
}
.files-folder-remove:hover, .files-entry-remove:hover { color: #b91c1c; }
.files-folder-empty { margin: 0 0 0 18px; color: var(--text-muted); font-style: italic; }
.files-entries { margin: 0; padding-left: 18px; list-style: none; }
.files-entry { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.files-entry-label { flex: 0 1 auto; }
.files-entry-score { color: var(--accent); }
.files-saving-banner {
  margin-bottom: 10px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  display: flex;
  align-items: center;
  gap: 8px;
}
.files-save-here, .files-save-cancel {
  font: inherit;
  font-size: 12px;
  padding: 2px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.files-save-here:disabled { color: var(--text-muted); cursor: default; }
.files-crumbs { margin: 0 0 8px; display: flex; align-items: center; gap: 2px; }
.files-crumb {
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
}
.files-crumb:hover { text-decoration: underline; }
.files-crumb-sep { color: var(--text-muted); }
.files-list { margin: 0; padding: 0; list-style: none; }
.files-subfolder {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  cursor: pointer;
}
.files-subfolder:hover { background: var(--bg-hover); }
.files-subfolder-name { font-weight: var(--font-weight-semibold); }
.files-up .files-subfolder-name { color: var(--text-muted); }
.models-save-to {
  font: inherit;
  font-size: 12px;
  padding: 1px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.models-save-to:hover { color: var(--text-primary); background: var(--bg-hover); }
/* Detail-strip folder controls. */
.models-fav {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 16px;
  cursor: pointer;
  padding: 0 2px;
}
.models-save-folder {
  font: inherit;
  font-size: 12px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 1px 4px;
  max-width: 160px;
}
.models-in-folders { margin: 0; color: var(--text-muted); font-size: 12px; }
/* The rating slider: one claim, in the detail strip. */
.models-rating {
  display: flex;
  align-items: center;
  gap: 10px;
}
.models-rating-caption { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.models-rating-slider { flex: 0 1 260px; accent-color: var(--accent); }
.models-rating-value { color: var(--accent); font-size: 12px; white-space: nowrap; }
</style>
