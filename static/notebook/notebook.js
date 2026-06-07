/* ─── Vue 3 Notebook App ─── */
(function() {
  var Vue = window.Vue;
  if (!Vue) { console.error('Vue not loaded'); return; }

  var { createApp, reactive, computed, watch, ref, onMounted, onUnmounted, nextTick } = Vue;

  var WEEKDAYS = ['日','一','二','三','四','五','六'];

  // ==================== Components ====================

  var FolderTreeItem = {
    name: 'FolderTreeItem',
    props: {
      node:       { type: Object, required: true },
      depth:      { type: Number, default: 0 },
      expanded:   { type: Boolean, default: true },
      selectedFolderId: String,
      editingNoteId: String,
    },
    emits: ['toggle-folder', 'select-folder', 'open-note', 'folder-menu'],
    template: /* html */`
      <div>
        <div class="nb-tree-item nb-tree-folder"
             :class="{ active: selectedFolderId === node.id }"
             :style="{ paddingLeft: (12 + depth * 16) + 'px' }"
             @click="$emit('select-folder', node.id)">
          <span class="nb-tree-toggle" @click.stop="$emit('toggle-folder', node.id)">{{ expanded ? '\u25bc' : '\u25b6' }}</span>
          <span class="nb-tree-icon">{{ expanded ? '\ud83d\udcc2' : '\ud83d\udcc1' }}</span>
          <span class="nb-tree-name">{{ node.name || '\u672a\u547d\u540d\u6587\u4ef6\u5939' }}</span>
          <span class="nb-tree-count">{{ (node.notes ? node.notes.length : 0) + (node.children ? node.children.length : 0) }}</span>
          <span class="nb-tree-menu-btn" @click.stop="$emit('folder-menu', $event, node.id)" title="更多">&ctdot;</span>
        </div>

        <div v-if="expanded && (hasContent)">
          <FolderTreeItem
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :depth="depth + 1"
            :expanded="isExpanded(child.id)"
            :selected-folder-id="selectedFolderId"
            :editing-note-id="editingNoteId"
            @toggle-folder="(id) => $emit('toggle-folder', id)"
            @select-folder="(id) => $emit('select-folder', id)"
            @open-note="(id) => $emit('open-note', id)"
            @folder-menu="(e, id) => $emit('folder-menu', e, id)"
          />

          <div v-for="note in node.notes" :key="note.id"
               class="nb-tree-item nb-tree-note"
               :class="{ active: editingNoteId === note.id }"
               :style="{ paddingLeft: (28 + depth * 16) + 'px' }"
               @click="$emit('open-note', note.id)">
            <span class="nb-tree-icon">\ud83d\udcc4</span>
            <span class="nb-tree-name">{{ note.title }}</span>
          </div>
        </div>
      </div>
    `,
    inject: ['expandedFolders'],
    computed: {
      hasContent() {
        var n = this.node;
        return (n.children && n.children.length > 0) || (n.notes && n.notes.length > 0);
      }
    },
    methods: {
      isExpanded(id) { return this.expandedFolders[id] !== false; }
    }
  };

  var NoteEditor = {
    props: {
      noteId:  { type: String, default: null },
      folderId: { type: String, default: null },
    },
    emits: ['saved', 'deleted'],
    template: /* html */`
      <div>
        <div class="nb-editor-header">
          <input class="nb-title-input" v-model="title" placeholder="\u7b14\u8bb0\u6807\u9898\u2026" @input="markDirty">
          <input class="nb-tags-input" v-model="tagsStr" placeholder="\u6807\u7b7e\uff08\u9017\u53f7\u5206\u9694\uff09" @input="markDirty">
          <div class="nb-editor-actions">
            <span style="font-size:11px;color:var(--text-3);">{{ statusText }}</span>
            <button class="nb-btn nb-btn-save" @click="save()">\ud83d\udcbe \u4fdd\u5b58</button>
            <button class="nb-btn nb-btn-delete" @click="del">\ud83d\uddd1</button>
          </div>
        </div>
        <div class="nb-vditor-wrap" id="nb-vditor-container"></div>
      </div>
    `,
    data: function() {
      return {
        title: '',
        tagsStr: '',
        statusText: '',
        vd: null,
        lastSavedMd: '',
        dirty: false,
        autoSaveTimer: null,
        loading: false,
      };
    },
    methods: {
      markDirty: function() { this.dirty = true; },
      initVditor: function(md) {
        var self = this;
        var container = document.getElementById('nb-vditor-container');
        if (!container) return;
        if (self.vd) { try { self.vd.destroy(); } catch(e) {} self.vd = null; }
        container.innerHTML = '';

        self.vd = new Vditor('nb-vditor-container', {
          height: window.innerHeight - 150,
          mode: 'ir',
          placeholder: '\u5f00\u59cb\u5199\u4f5c\u2026',
          value: md || '',
          cache: { enable: false },
          toolbar: [
            'headings','bold','italic','strike','line','quote',
            'list','ordered-list','check','code','inline-code',
            'link','table','|',
            'undo','redo','|',
            'fullscreen','outline'
          ],
          after: function() {
            self.vd.vditor.element.addEventListener('input', function() {
              self.dirty = true;
              self.autoSave();
            });
          },
          blur: function(val) {
            if (val !== self.lastSavedMd) self.dirty = true;
          },
          upload: { accept: 'image/*', handler: function() { return null; } },
        });
      },
      loadNote: async function() {
        if (!this.noteId) {
          this.title = ''; this.tagsStr = ''; this.dirty = false;
          this.lastSavedMd = ''; this.statusText = '\u65b0\u7b14\u8bb0';
          this.initVditor('');
          return;
        }
        this.loading = true;
        try {
          var note = await API.getNote(this.noteId);
          this.title = note.title || '';
          this.tagsStr = (note.tags || []).join(', ');
          this.lastSavedMd = note.content || '';
          this.dirty = false;
          this.statusText = '\u5df2\u52a0\u8f7d';
          this.initVditor(note.content || '');
        } catch(e) {
          showToast('\u52a0\u8f7d\u7b14\u8bb0\u5931\u8d25');
          this.$emit('deleted'); // let parent reset
        } finally {
          this.loading = false;
        }
      },
      getContent: function() {
        return this.vd ? this.vd.getValue() : '';
      },
      save: async function(silent) {
        var content = this.getContent();
        var title = this.title.trim();
        var tags = this.tagsStr ? this.tagsStr.split(',').map(function(t){return t.trim();}).filter(Boolean) : [];

        try {
          if (this.noteId) {
            await API.updateNote(this.noteId, { title:title, content:content, tags:tags, folderId:this.folderId });
            if (!silent) showToast('\u7b14\u8bb0\u5df2\u4fdd\u5b58 \u2713');
          } else {
            var res = await API.createNote({ title:title, content:content, tags:tags, folderId:this.folderId });
            if (!silent) showToast('\u7b14\u8bb0\u5df2\u521b\u5efa \u2713');
          }
          this.lastSavedMd = content;
          this.dirty = false;
          this.statusText = '\u5df2\u4fdd\u5b58 ' + new Date().toLocaleTimeString();
          this.$emit('saved', { title: title, tags: tags });
        } catch(e) {
          if (!silent) showToast('\u4fdd\u5b58\u5931\u8d25');
        }
      },
      autoSave: function() {
        var self = this;
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(function() {
          if (self.noteId) self.save(true);
        }, 5000);
      },
      del: async function() {
        if (!this.noteId) return;
        if (!confirm('\u786e\u5b9a\u5220\u9664\u8fd9\u7bc7\u7b14\u8bb0\uff1f')) return;
        try {
          await API.deleteNote(this.noteId);
          showToast('\u7b14\u8bb0\u5df2\u5220\u9664');
          this.$emit('deleted');
        } catch(e) {
          showToast('\u5220\u9664\u5931\u8d25');
        }
      },
    },
    mounted: function() {
      this.loadNote();
    },
    unmounted: function() {
      if (this.vd) { try { this.vd.destroy(); } catch(e) {} this.vd = null; }
      clearTimeout(this.autoSaveTimer);
    },
  };

  var DiaryEditor = {
    props: { date: { type: String, default: '' } },
    emits: ['update-date', 'saved'],
    template: /* html */`
      <div>
        <div class="nb-editor-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="nb-btn nb-btn-icon" @click="nav(-1)" title="\u524d\u4e00\u5929">\u25c0</button>
            <span style="font-size:14px;font-weight:500;min-width:140px;text-align:center;">{{ dateLabel }}</span>
            <button class="nb-btn nb-btn-icon" @click="nav(1)" title="\u540e\u4e00\u5929">\u25b6</button>
            <button class="nb-btn" style="font-size:11px;padding:2px 10px;" @click="goToday">\u4eca\u5929</button>
          </div>
          <div class="nb-editor-actions">
            <span style="font-size:11px;color:var(--text-3);">{{ statusText }}</span>
            <button class="nb-btn nb-btn-save" @click="save">\ud83d\udcbe \u4fdd\u5b58\u65e5\u8bb0</button>
          </div>
        </div>
        <div class="nb-vditor-wrap" id="nb-diary-vditor-container"></div>
      </div>
    `,
    data: function() {
      return {
        statusText: '',
        vd: null,
        lastSavedMd: '',
        dirty: false,
      };
    },
    computed: {
      dateLabel: function() {
        var d = new Date(this.date + 'T00:00:00');
        return this.date + ' \u5468' + WEEKDAYS[d.getDay()];
      }
    },
    methods: {
      initVditor: function(md) {
        var self = this;
        var container = document.getElementById('nb-diary-vditor-container');
        if (!container) return;
        if (self.vd) { try { self.vd.destroy(); } catch(e) {} self.vd = null; }
        container.innerHTML = '';

        self.vd = new Vditor('nb-diary-vditor-container', {
          height: window.innerHeight - 150,
          mode: 'ir',
          placeholder: '\u4eca\u5929\u53d1\u751f\u4e86\u4ec0\u4e48\uff1f\u8bb0\u5f55\u4e00\u4e0b\u5427\u2026',
          value: md || '',
          cache: { enable: false },
          toolbar: [
            'headings','bold','italic','strike','line','quote',
            'list','ordered-list','check','code','inline-code',
            'link','table','|',
            'undo','redo','|',
            'fullscreen','outline'
          ],
          after: function() {
            self.vd.vditor.element.addEventListener('input', function() { self.dirty = true; });
          },
          blur: function(val) { if (val !== self.lastSavedMd) self.dirty = true; },
          upload: { accept: 'image/*', handler: function() { return null; } },
        });
      },
      loadDiary: async function() {
        try {
          var data = await API.getDiary(this.date);
          this.lastSavedMd = data.content || '';
          this.statusText = data.exists ? '\u5df2\u52a0\u8f7d' : '\u65b0\u65e5\u8bb0';
          this.initVditor(data.content || '');
        } catch(e) {
          this.lastSavedMd = '';
          this.initVditor('');
        }
      },
      getContent: function() { return this.vd ? this.vd.getValue() : ''; },
      save: async function() {
        var content = this.getContent();
        try {
          await API.saveDiary(this.date, content);
          this.lastSavedMd = content;
          this.dirty = false;
          this.statusText = '\u5df2\u4fdd\u5b58 ' + new Date().toLocaleTimeString();
          showToast('\u65e5\u8bb0\u5df2\u4fdd\u5b58 \u2713');
          this.$emit('saved');
        } catch(e) {
          showToast('\u4fdd\u5b58\u5931\u8d25');
        }
      },
      nav: function(delta) {
        var d = new Date(this.date + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        this.$emit('update-date', d.toISOString().slice(0, 10));
      },
      goToday: function() {
        var d = new Date();
        this.$emit('update-date', d.toISOString().slice(0, 10));
      },
    },
    watch: {
      date: {
        immediate: true,
        handler: function() {
          var self = this;
          nextTick(function() { self.loadDiary(); });
        }
      }
    },
    unmounted: function() {
      if (this.vd) { try { this.vd.destroy(); } catch(e) {} this.vd = null; }
    },
  };

  // ==================== App ====================

  var NotebookApp = {
    components: { FolderTreeItem, NoteEditor, DiaryEditor },
    template: /* html */`
      <div class="notebook-layout">
        <!-- Left sidebar -->
        <div class="nb-sidebar">
          <div class="nb-sidebar-toolbar">
            <span style="font-size:14px;font-weight:600;">\ud83d\udcd3 \u7b14\u8bb0</span>
            <div style="display:flex;gap:4px;">
              <button class="nb-btn nb-btn-icon" @click="createFolder" title="\u65b0\u5efa\u6587\u4ef6\u5939">\ud83d\udcc1+</button>
              <button class="nb-btn nb-btn-icon" @click="newNote" title="\u65b0\u5efa\u7b14\u8bb0">\ud83d\udcc4+</button>
              <button class="nb-btn nb-btn-icon" @click="showDiary" title="\u5199\u65e5\u8bb0">\ud83d\udcc5</button>
            </div>
          </div>

          <div class="nb-search">
            <input type="text" v-model="searchQuery" placeholder="\u641c\u7d22\u7b14\u8bb0\u2026">
          </div>

          <div class="nb-tree">
            <!-- Diary quick entry -->
            <div class="nb-tree-item nb-tree-diary" :class="{ active: view === 'diary' }" @click="showDiary">
              <span class="nb-tree-icon">\ud83d\udcc5</span> \u65e5\u8bb0
            </div>

            <!-- All notes -->
            <div class="nb-tree-item nb-tree-all" :class="{ active: view === 'folder' && !selectedFolderId }" @click="selectFolder(null)">
              <span class="nb-tree-icon">\ud83d\udcd3</span> \u6240\u6709\u7b14\u8bb0
            </div>

            <!-- Search results (flat) -->
            <template v-if="isSearching">
              <div v-if="searchResults.length === 0" style="text-align:center;padding:24px;color:var(--text-3);">\u65e0\u5339\u914d\u7ed3\u679c</div>
              <div class="nb-tree-section" v-else>\u641c\u7d22\u7ed3\u679c ({{ searchResults.length }})</div>
              <div v-for="n in searchResults" :key="n.id"
                   class="nb-tree-item nb-tree-note"
                   style="padding-left:12px;"
                   @click="openNote(n.id)">
                <span class="nb-tree-icon">\ud83d\udcc4</span>
                <span class="nb-tree-name">{{ n.title || '\u65e0\u6807\u9898' }}</span>
                <span class="nb-tree-count" style="font-size:10px;">{{ snippet(n.content) }}</span>
              </div>
            </template>

            <!-- Normal tree -->
            <template v-else>
              <FolderTreeItem
                v-for="node in treeData.tree"
                :key="node.id"
                :node="node"
                :depth="0"
                :expanded="isExpanded(node.id)"
                :selected-folder-id="selectedFolderId"
                :editing-note-id="editingNoteId"
                @toggle-folder="toggleFolder"
                @select-folder="selectFolder"
                @open-note="openNote"
                @folder-menu="folderMenu"
              />

              <template v-if="treeData.orphanNotes && treeData.orphanNotes.length > 0">
                <div class="nb-tree-section">\u672a\u5f52\u7c7b\u7b14\u8bb0</div>
                <div v-for="n in treeData.orphanNotes" :key="n.id"
                     class="nb-tree-item nb-tree-note"
                     :class="{ active: editingNoteId === n.id }"
                     style="padding-left:28px;"
                     @click="openNote(n.id)">
                  <span class="nb-tree-icon">\ud83d\udcc4</span>
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
              <div style="font-size:48px;margin-bottom:12px;">\ud83d\udcdd</div>
              <div>\u9009\u62e9\u4e00\u4e2a\u7b14\u8bb0\u5f00\u59cb\u7f16\u8f91</div>
              <div style="font-size:12px;color:var(--text-3);margin-top:4px;">\u6216\u70b9\u51fb\u5de6\u4fa7 + \u65b0\u5efa\u7b14\u8bb0</div>
            </div>
          </template>
        </div>
      </div>
    `,

    data: function() {
      return {
        view: 'empty',           // 'empty' | 'folder' | 'note' | 'diary'
        selectedFolderId: null,
        editingNoteId: null,
        editingNoteKey: 0,       // force re-mount NoteEditor on note change
        diaryDate: todayStr(),
        treeData: { tree: [], orphanNotes: [] },
        expandedFolders: {},
        searchQuery: '',
        searchResults: [],
        searchTimer: null,
      };
    },

    computed: {
      isSearching: function() {
        return this.searchQuery.trim().length > 0;
      }
    },

    provide: function() {
      return { expandedFolders: this.expandedFolders };
    },

    methods: {
      // ─── Tree ───
      isExpanded: function(id) { return this.expandedFolders[id] !== false; },

      loadTree: async function() {
        try {
          var data = await API.getFolderTree();
          this.treeData = data;
        } catch(e) {
          this.treeData = { tree: [], orphanNotes: [] };
        }
      },

      toggleFolder: function(id) {
        if (this.expandedFolders[id] === false) {
          this.expandedFolders[id] = true;
        } else {
          this.expandedFolders[id] = false;
        }
      },

      // ─── Navigation ───
      selectFolder: function(id) {
        this.selectedFolderId = id;
        this.view = 'folder';
      },

      openNote: async function(id) {
        this.editingNoteId = id;
        this.editingNoteKey++;  // force NoteEditor remount
        this.selectedFolderId = null;
        this.view = 'note';
        this.searchQuery = '';  // clear search
        await this.loadTree();
      },

      newNote: function() {
        this.editingNoteId = null;
        this.editingNoteKey++;
        this.view = 'note';
        this.searchQuery = '';
      },

      showDiary: function() {
        this.view = 'diary';
        this.diaryDate = todayStr();
        this.editingNoteId = null;
        this.searchQuery = '';
      },

      // ─── Diary ───
      diaryNavigate: async function(newDate) {
        this.diaryDate = newDate;
      },

      onDiarySaved: function() {
        // Could refresh something here
      },

      // ─── Note save/delete callbacks ───
      onNoteSaved: async function(payload) {
        // If it was a new note (editingNoteId was null), refresh tree
        // NoteEditor emits 'saved' but we need the new ID
        // Re-load tree to show the new note
        await this.loadTree();
      },

      onNoteDeleted: function() {
        this.editingNoteId = null;
        this.view = 'empty';
        this.loadTree();
      },

      // ─── Folder CRUD ───
      createFolder: async function() {
        var name = prompt('\u6587\u4ef6\u5939\u540d\u79f0\uff1a');
        if (!name || !name.trim()) return;
        try {
          await API.createFolder({ name: name.trim(), parentId: this.selectedFolderId || null });
          showToast('\u6587\u4ef6\u5939\u5df2\u521b\u5efa \u2713');
          this.loadTree();
        } catch(e) {
          showToast('\u521b\u5efa\u5931\u8d25');
        }
      },

      folderMenu: function(e, folderId) {
        e.stopPropagation();
        var action = prompt('\u64cd\u4f5c\uff1arename=\u91cd\u547d\u540d, delete=\u5220\u9664', 'rename');
        if (!action) return;
        if (action === 'rename' || action === '\u91cd\u547d\u540d') {
          this.renameFolder(folderId);
        } else if (action === 'delete' || action === '\u5220\u9664') {
          this.deleteFolder(folderId);
        }
      },

      renameFolder: async function(folderId) {
        var name = prompt('\u65b0\u540d\u79f0\uff1a');
        if (!name || !name.trim()) return;
        try {
          await API.updateFolder(folderId, { name: name.trim() });
          showToast('\u5df2\u91cd\u547d\u540d \u2713');
          this.loadTree();
        } catch(e) { showToast('\u91cd\u547d\u540d\u5931\u8d25'); }
      },

      deleteFolder: async function(folderId) {
        if (!confirm('\u786e\u5b9a\u5220\u9664\u6574\u4e2a\u6587\u4ef6\u5939\uff1f\u6587\u4ef6\u5939\u5185\u7684\u7b14\u8bb0\u4e0d\u4f1a\u88ab\u5220\u9664\uff0c\u53ea\u4f1a\u79fb\u51fa\u6587\u4ef6\u5939\u3002')) return;
        try {
          await API.deleteFolder(folderId);
          showToast('\u6587\u4ef6\u5939\u5df2\u5220\u9664 \u2713');
          if (this.selectedFolderId === folderId) this.selectedFolderId = null;
          this.loadTree();
        } catch(e) { showToast('\u5220\u9664\u5931\u8d25'); }
      },

      // ─── Search ───
      snippet: function(content) {
        if (!content) return '';
        return content.replace(/[#*_~`>\\[\\]\\n]/g, '').slice(0, 40);
      },
    },

    watch: {
      searchQuery: function(q) {
        var self = this;
        clearTimeout(this.searchTimer);
        if (!q.trim()) {
          self.searchResults = [];
          self.loadTree();
          return;
        }
        this.searchTimer = setTimeout(async function() {
          try {
            var data = await API.listNotes(q.trim());
            self.searchResults = data.notes || [];
          } catch(e) {
            self.searchResults = [];
          }
        }, 300);
      }
    },

    mounted: function() {
      this.loadTree();
    },
  };

  // ─── Mount ───
  var mountEl = document.getElementById('page-diary');
  if (mountEl) {
    mountEl._vueApp = createApp(NotebookApp);
    var vm = mountEl._vueApp.mount(mountEl);
    // Expose loadTree globally so switchPage can refresh on tab switch
    window.nbVue = vm;
  }
})();
