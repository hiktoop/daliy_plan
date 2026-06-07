<template>
  <div>
    <div class="nb-editor-header">
      <input
        class="nb-title-input"
        v-model="title"
        placeholder="笔记标题…"
        @input="markDirty"
      />
      <input
        class="nb-tags-input"
        v-model="tagsStr"
        placeholder="标签（逗号分隔）"
        @input="markDirty"
      />
      <div class="nb-editor-actions">
        <span style="font-size:11px;color:var(--text-3);">{{ statusText }}</span>
        <button class="nb-btn nb-btn-save" @click="save()">💾 保存</button>
        <button class="nb-btn nb-btn-delete" @click="del">🗑</button>
      </div>
    </div>
    <div class="nb-vditor-wrap" id="nb-vditor-container"></div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

export default {
  name: 'NoteEditor',
  props: {
    noteId: { type: String, default: null },
    folderId: { type: String, default: null },
  },
  emits: ['saved', 'deleted'],
  data() {
    return {
      title: '',
      tagsStr: '',
      statusText: '',
      vd: null,
      lastSavedMd: '',
      dirty: false,
      autoSaveTimer: null,
      loading: false,
    }
  },
  methods: {
    markDirty() {
      this.dirty = true
    },
    initVditor(md) {
      const container = document.getElementById('nb-vditor-container')
      if (!container) return
      if (this.vd) {
        try { this.vd.destroy() } catch (e) {}
        this.vd = null
      }
      container.innerHTML = ''

      this.vd = new window.Vditor('nb-vditor-container', {
        height: window.innerHeight - 150,
        mode: 'ir',
        placeholder: '开始写作…',
        value: md || '',
        cache: { enable: false },
        toolbar: [
          'headings', 'bold', 'italic', 'strike', 'line', 'quote',
          'list', 'ordered-list', 'check', 'code', 'inline-code',
          'link', 'table', '|',
          'undo', 'redo', '|',
          'fullscreen', 'outline',
        ],
        after: () => {
          this.vd.vditor.element.addEventListener('input', () => {
            this.dirty = true
            this.autoSave()
          })
        },
        blur: (val) => {
          if (val !== this.lastSavedMd) this.dirty = true
        },
        upload: { accept: 'image/*', handler: () => null },
      })
    },
    async loadNote() {
      if (!this.noteId) {
        this.title = ''
        this.tagsStr = ''
        this.dirty = false
        this.lastSavedMd = ''
        this.statusText = '新笔记'
        this.initVditor('')
        return
      }
      this.loading = true
      try {
        const note = await window.API.getNote(this.noteId)
        this.title = note.title || ''
        this.tagsStr = (note.tags || []).join(', ')
        this.lastSavedMd = note.content || ''
        this.dirty = false
        this.statusText = '已加载'
        this.initVditor(note.content || '')
      } catch (e) {
        window.showToast('加载笔记失败')
        this.$emit('deleted')
      } finally {
        this.loading = false
      }
    },
    getContent() {
      return this.vd ? this.vd.getValue() : ''
    },
    async save(silent = false) {
      const content = this.getContent()
      const title = this.title.trim()
      const tags = this.tagsStr
        ? this.tagsStr.split(',').map(t => t.trim()).filter(Boolean)
        : []

      try {
        if (this.noteId) {
          await window.API.updateNote(this.noteId, { title, content, tags, folderId: this.folderId })
          if (!silent) window.showToast('笔记已保存 ✓')
        } else {
          const res = await window.API.createNote({ title, content, tags, folderId: this.folderId })
          if (!silent) window.showToast('笔记已创建 ✓')
        }
        this.lastSavedMd = content
        this.dirty = false
        this.statusText = '已保存 ' + new Date().toLocaleTimeString()
        this.$emit('saved', { title, tags })
      } catch (e) {
        if (!silent) window.showToast('保存失败')
      }
    },
    autoSave() {
      clearTimeout(this.autoSaveTimer)
      this.autoSaveTimer = setTimeout(() => {
        if (this.noteId) this.save(true)
      }, 5000)
    },
    async del() {
      if (!this.noteId) return
      if (!confirm('确定删除这篇笔记？')) return
      try {
        await window.API.deleteNote(this.noteId)
        window.showToast('笔记已删除')
        this.$emit('deleted')
      } catch (e) {
        window.showToast('删除失败')
      }
    },
  },
  mounted() {
    this.loadNote()
  },
  unmounted() {
    if (this.vd) {
      try { this.vd.destroy() } catch (e) {}
      this.vd = null
    }
    clearTimeout(this.autoSaveTimer)
  },
}
</script>
