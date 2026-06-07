<template>
  <div>
    <div
      class="nb-tree-item nb-tree-folder"
      :class="{ active: selectedFolderId === node.id }"
      :style="{ paddingLeft: 12 + depth * 16 + 'px' }"
      @click="$emit('select-folder', node.id)"
    >
      <span class="nb-tree-toggle" @click.stop="$emit('toggle-folder', node.id)">
        {{ isExpanded(node.id) ? '▼' : '▶' }}
      </span>
      <span class="nb-tree-icon">{{ isExpanded(node.id) ? '📂' : '📁' }}</span>
      <span class="nb-tree-name">{{ node.name || '未命名文件夹' }}</span>
      <span class="nb-tree-count">{{ (node.notes ? node.notes.length : 0) + (node.children ? node.children.length : 0) }}</span>
      <span class="nb-tree-menu-btn" @click.stop="$emit('folder-menu', $event, node.id)" title="更多">⁝</span>
    </div>

    <div v-if="isExpanded(node.id) && hasContent">
      <FolderTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :selected-folder-id="selectedFolderId"
        :editing-note-id="editingNoteId"
        @toggle-folder="$emit('toggle-folder', $event)"
        @select-folder="$emit('select-folder', $event)"
        @open-note="$emit('open-note', $event)"
        @folder-menu="$emit('folder-menu', $event, $event)"
      />

      <div
        v-for="note in node.notes"
        :key="note.id"
        class="nb-tree-item nb-tree-note"
        :class="{ active: editingNoteId === note.id }"
        :style="{ paddingLeft: 28 + depth * 16 + 'px' }"
        @click="$emit('open-note', note.id)"
      >
        <span class="nb-tree-icon">📄</span>
        <span class="nb-tree-name">{{ note.title }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import FolderTreeItem from './FolderTreeItem.vue'

export default {
  name: 'FolderTreeItem',
  components: { FolderTreeItem },
  inject: ['expandedFolders'],
  props: {
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    selectedFolderId: String,
    editingNoteId: String,
  },
  emits: ['toggle-folder', 'select-folder', 'open-note', 'folder-menu'],
  computed: {
    hasContent() {
      const n = this.node
      return (n.children && n.children.length > 0) || (n.notes && n.notes.length > 0)
    },
  },
  methods: {
    isExpanded(id) {
      return this.expandedFolders[id] !== false
    },
  },
}
</script>
