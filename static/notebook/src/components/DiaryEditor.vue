<template>
  <div>
    <div class="nb-editor-header">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="nb-btn nb-btn-icon" @click="nav(-1)" title="前一天">◀</button>
        <span style="font-size:14px;font-weight:500;min-width:140px;text-align:center;">
          {{ dateLabel }}
        </span>
        <button class="nb-btn nb-btn-icon" @click="nav(1)" title="后一天">▶</button>
        <button class="nb-btn" style="font-size:11px;padding:2px 10px;" @click="goToday">今天</button>
      </div>
      <div class="nb-editor-actions">
        <span style="font-size:11px;color:var(--text-3);">{{ statusText }}</span>
        <button class="nb-btn nb-btn-save" @click="save">💾 保存日记</button>
      </div>
    </div>
    <div class="nb-vditor-wrap" id="nb-diary-vditor-container"></div>
  </div>
</template>

<script>
export default {
  name: 'DiaryEditor',
  props: {
    date: { type: String, default: '' },
  },
  emits: ['update-date', 'saved'],
  data() {
    return {
      statusText: '',
      vd: null,
      lastSavedMd: '',
      dirty: false,
    }
  },
  computed: {
    dateLabel() {
      const d = new Date(this.date + 'T00:00:00')
      const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
      return this.date + ' 周' + WEEKDAYS[d.getDay()]
    },
  },
  watch: {
    date: {
      immediate: true,
      handler() {
        this.$nextTick(() => {
          this.loadDiary()
        })
      },
    },
  },
  methods: {
    initVditor(md) {
      const container = document.getElementById('nb-diary-vditor-container')
      if (!container) return
      if (this.vd) {
        try { this.vd.destroy() } catch (e) {}
        this.vd = null
      }
      container.innerHTML = ''

      this.vd = new window.Vditor('nb-diary-vditor-container', {
        height: window.innerHeight - 150,
        mode: 'ir',
        placeholder: '今天发生了什么？记录一下吧…',
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
          })
        },
        blur: (val) => {
          if (val !== this.lastSavedMd) this.dirty = true
        },
        upload: { accept: 'image/*', handler: () => null },
      })
    },
    async loadDiary() {
      try {
        const data = await window.API.getDiary(this.date)
        this.lastSavedMd = data.content || ''
        this.statusText = data.exists ? '已加载' : '新日记'
        this.initVditor(data.content || '')
      } catch (e) {
        this.lastSavedMd = ''
        this.initVditor('')
      }
    },
    getContent() {
      return this.vd ? this.vd.getValue() : ''
    },
    async save() {
      const content = this.getContent()
      try {
        await window.API.saveDiary(this.date, content)
        this.lastSavedMd = content
        this.dirty = false
        this.statusText = '已保存 ' + new Date().toLocaleTimeString()
        window.showToast('日记已保存 ✓')
        this.$emit('saved')
      } catch (e) {
        window.showToast('保存失败')
      }
    },
    nav(delta) {
      const d = new Date(this.date + 'T00:00:00')
      d.setDate(d.getDate() + delta)
      this.$emit('update-date', d.toISOString().slice(0, 10))
    },
    goToday() {
      const d = new Date()
      this.$emit('update-date', d.toISOString().slice(0, 10))
    },
  },
  unmounted() {
    if (this.vd) {
      try { this.vd.destroy() } catch (e) {}
      this.vd = null
    }
  },
}
</script>
