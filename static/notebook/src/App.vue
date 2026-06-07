<template>
  <div class="notebook-layout">
    <!-- Left sidebar -->
    <div class="nb-sidebar">
      <div class="nb-sidebar-toolbar">
        <span style="font-size:14px;font-weight:600;">📓 笔记</span>
        <div style="display:flex;gap:4px;">
          <button class="nb-btn nb-btn-icon" @click="createFolder" title="新建文件夹">📁+</button>
          <button class="nb-btn nb-btn-icon" @click="newNote" title="新建笔记">📄+</button>
          <button class="nb-btn nb-btn-icon" @click="showDiary" title="写日记">📅</button>
        </div>
      </div>

      <div class="nb-search">
        <input type="text" v-model="searchQuery" placeholder="搜索笔记…" />
      </div>

      <div class="nb-tree">
        <!-- Diary quick entry -->
        <div
          class="nb-tree-item nb-tree-diary"
          :class="{ active: view === 'diary' }"
          @click="showDiary"
        >
          <span class="nb-tree-icon">📅</span> 日记
        </div>

        <!-- All notes -->
        <div
          class="nb-tree-item nb-tree-all"
          :class="{ active: view === 'folder' && !selectedFolderId }"
          @click="selectFolder(null)"
        >
          <span class="nb-tree-icon">📓</span> 所有笔记
        </div>

        <!-- Search results (flat) -->
        <template v-if="isSearching">
          <div v-if="searchResults.length === 0" style="text-align:center;padding:24px;color:var(--text-3);">
            无匹配结果
          </div>
          <div v-else class="nb-tree-section">搜索结果 ({{ searchResults.length }})</div>
          <div
            v-for="n in searchResults"
            :key="n.id"
            class="nb-tree-item nb-tree-note"
            style="padding-left:12px;"
            @click="openNote(n.id)"
          >
            <span class="nb-tree-icon">📄</span>
            <span class="nb-tree-name">{{ n.title || '无标题' }}</span>
          </div>
        </template>

        <!-- Normal tree -->
        <template v-else>
          <FolderTreeItem
            v-for="node in treeData.tree"
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-folder-id="selectedFolderId"
            :editing-note-id="editingNoteId"
            @toggle-folder="toggleFolder"
            @select-folder="selectFolder"
            @open-note="openNote"
            @folder-menu="folderMenu"
          />

          <template v-if="treeData.orphanNotes && treeData.orphanNotes.length > 0">
            <div class="nb-tree-section">未归类笔记</div>
            <div
              v-for="n in treeData.orphanNotes"
              :key="n.id"
              class="nb-tree-item nb-tree-note"
              :class="{ active: editingNoteId === n.id }"
              style="padding-left:28px;"
              @click="openNote(n.id)"
            >
              <span class="nb-tree-icon">📄</span>
              <span class="nb-tree-name">{{ n.title }}</span>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Right panel -->
    <div class="nb-editor">
      <!-- Note Editor -->
      <template v-if="view === 'note'">
        <NoteEditor
          :key="editingNoteKey"
          :note-id="editingNoteId"
          :folder-id="selectedFolderId"
          @saved="onNoteSaved"
          @deleted="onNoteDeleted"
        />
      </template>

      <!-- Diary Editor -->
      <template v-else-if="view === 'diary'">
        <DiaryEditor
          :date="diaryDate"
          @update-date="diaryNavigate"
          @saved="onDiarySaved"
        />
      </template>

      <!-- Empty state -->
      <template v-else>
        <div class="nb-empty">
          <div style="font-size:48px;margin-bottom:12px;">📝</div>
          <div>选择一个笔记开始编辑</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px;">
            或点击左侧 + 新建笔记
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import FolderTreeItem from './components/FolderTreeItem.vue'
import NoteEditor from './components/NoteEditor.vue'
import DiaryEditor from './components/DiaryEditor.vue'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default {
  name: 'NotebookApp',
  components: { FolderTreeItem, NoteEditor, DiaryEditor },
  provide() {
    return {
      expandedFolders: this.expandedFolders,
    }
  },
  data() {
    return {
      view: 'empty',
      selectedFolderId: null,
      editingNoteId: null,
      editingNoteKey: 0,
      diaryDate: todayStr(),
      treeData: { tree: [], orphanNotes: [] },
      expandedFolders: {},
      searchQuery: '',
      searchResults: [],
      searchTimer: null,
    }
  },
  computed: {
    isSearching() {
      return this.searchQuery.trim().length > 0
    },
  },
  watch: {
    searchQuery(q) {
      clearTimeout(this.searchTimer)
      if (!q.trim()) {
        this.searchResults = []
        this.loadTree()
        return
      }
      this.searchTimer = setTimeout(async () => {
        try {
          const data = await window.API.listNotes(q.trim())
          this.searchResults = data.notes || []
        } catch (e) {
          this.searchResults = []
        }
      }, 300)
    },
  },
  mounted() {
    this.loadTree()
  },
  methods: {
    isExpanded(id) {
      return this.expandedFolders[id] !== false
    },
    async loadTree() {
      try {
        const data = await window.API.getFolderTree()
        this.treeData = data
      } catch (e) {
        this.treeData = { tree: [], orphanNotes: [] }
      }
    },
    toggleFolder(id) {
      if (this.expandedFolders[id] === false) {
        this.expandedFolders[id] = true
      } else {
        this.expandedFolders[id] = false
      }
    },
    selectFolder(id) {
      this.selectedFolderId = id
      this.view = 'folder'
    },
    async openNote(id) {
      this.editingNoteId = id
      this.editingNoteKey++
      this.selectedFolderId = null
      this.view = 'note'
      this.searchQuery = ''
      await this.loadTree()
    },
    newNote() {
      this.editingNoteId = null
      this.editingNoteKey++
      this.view = 'note'
      this.searchQuery = ''
    },
    showDiary() {
      this.view = 'diary'
      this.diaryDate = todayStr()
      this.editingNoteId = null
      this.searchQuery = ''
    },
    async diaryNavigate(newDate) {
      this.diaryDate = newDate
    },
    onDiarySaved() {
      // Could refresh something here
    },
    async onNoteSaved() {
      await this.loadTree()
    },
    onNoteDeleted() {
      this.editingNoteId = null
      this.view = 'empty'
      this.loadTree()
    },
    async createFolder() {
      const name = prompt('文件夹名称：')
      if (!name || !name.trim()) return
      try {
        await window.API.createFolder({ name: name.trim(), parentId: this.selectedFolderId || null })
        window.showToast('文件夹已创建 ✓')
        this.loadTree()
      } catch (e) {
        window.showToast('创建失败')
      }
    },
    folderMenu(e, folderId) {
      e.stopPropagation()
      const action = prompt('操作：rename=重命名, delete=删除', 'rename')
      if (!action) return
      if (action === 'rename' || action === '重命名') {
        this.renameFolder(folderId)
      } else if (action === 'delete' || action === '删除') {
        this.deleteFolder(folderId)
      }
    },
    async renameFolder(folderId) {
      const name = prompt('新名称：')
      if (!name || !name.trim()) return
      try {
        await window.API.updateFolder(folderId, { name: name.trim() })
        window.showToast('已重命名 ✓')
        this.loadTree()
      } catch (e) {
        window.showToast('重命名失败')
      }
    },
    async deleteFolder(folderId) {
      if (!confirm('确定删除整个文件夹？文件夹内的笔记不会被删除，只会被移出文件夹。')) return
      try {
        await window.API.deleteFolder(folderId)
        window.showToast('文件夹已删除 ✓')
        if (this.selectedFolderId === folderId) this.selectedFolderId = null
        this.loadTree()
      } catch (e) {
        window.showToast('删除失败')
      }
    },
  },
}
</script>
