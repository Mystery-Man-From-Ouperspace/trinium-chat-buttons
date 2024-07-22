import { TriniumLogger } from '../logger.js';
import { SETTINGS, DEFAULT_COLUMN } from '../settings.js';
import { Draggable } from '../../utils/draggable.js';
import { JournalEntryRenderer } from '../../utils/journal-entry-renderer.js';
import { TriniumConfirmationDialog } from '../../utils/confirmation-dialog.js';
import { TriniumNotification } from '../../utils/notification.js';

const CSS = {
  GM_SCREEN: '#tcb-gm-screen',
  GM_SCREEN_BUTTON: '#chat-controls .tcb-gm-screen-button',
  TAB_BUTTON: '.tcb-tab-button',
  EDIT_BUTTON: '.tcb-edit-button',
  SETTINGS_BUTTON: '.tcb-settings-button',
  EDITOR: '#tcb-gm-screen-editor',
  EDITOR_TEXTAREA: '#tcb-editor-textarea',
  EDITOR_PREVIEW: '.tcb-editor-preview',
  EDITOR_SAVE: '#tcb-editor-save',
  EDITOR_SAVE_CLOSE: '#tcb-editor-save-close',
  EDITOR_CANCEL: '#tcb-editor-cancel',
  EDITOR_RESTORE: '#tcb-editor-restore',
  SETTINGS_FORM: '#tcb-gm-screen-settings-form',
  SAVE_SETTINGS: '.tcb-close-settings',
  SAVE_CLOSE_SETTINGS: '.tcb-close-settings',
  CLOSE_SETTINGS: '.tcb-close-settings',
};

class GMScreen {
  static logger;

  static init() {
    this.logger = new TriniumLogger(SETTINGS.MODULE_NAME);
    this.logger.info('Initializing GM Screen');
    this.initializeEventListeners();
  }

  static initializeEventListeners() {
    this.logger.info('Initializing event listeners');

    // GM Screen toggle
    $(document).on('click.tcb-gm-screen', CSS.GM_SCREEN_BUTTON, this.toggleGMScreen.bind(this));

    // Tab switching
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.TAB_BUTTON}`, this.handleTabClick.bind(this));

    // Edit button
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.EDIT_BUTTON}`, this.openEditor.bind(this));

    // Settings button
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} ${CSS.SETTINGS_BUTTON}`, this.openSettings.bind(this));

    // Tab container
    $(document).on('click.tcb-gm-screen', `${CSS.GM_SCREEN} .tcb-tab-toggle`, this.toggleTabContainer.bind(this));

    // Editor events
    $(document).on('input', CSS.EDITOR_TEXTAREA, this.debounce(this.updateEditorPreview.bind(this), 300));
    $(document).on('click', CSS.EDITOR_SAVE, () => this.saveEditor(false));
    $(document).on('click', CSS.EDITOR_SAVE_CLOSE, () => this.saveEditor(true));
    $(document).on('click', CSS.EDITOR_CANCEL, this.closeEditor.bind(this));
    $(document).on('click', '#tcb-editor-load-preset', this.handleLoadPreset.bind(this));
    $(document).on('click', '#tcb-gm-screen-editor .tcb-editor-tab-button', this.handleEditorTabClick.bind(this));

    // Settings panel event listeners
    $(document).on('submit', '#tcb-gm-screen-settings-form', async (e) => {
      e.preventDefault();
      if (this.validateSettingsForm(e.target)) {
        await this.saveSettings(e);
        $('#tcb-gm-screen-settings').remove();
      }
    });

    $(document).on('click', '#tcb-save-settings', async (e) => {
      e.preventDefault();
      if (this.validateSettingsForm(e.target.form)) {
        await this.saveSettings(e);
      }
    });

    $(document).on('click', '.tcb-close-settings', () => {
      $('#tcb-gm-screen-settings').remove();
    });

    // Foundry hooks
    Hooks.on('renderChatLog', this.initializeGMScreenButton.bind(this));
  }

  static initializeGMScreenButton(chatLog, html) {
    if (!game.user.isGM) return;

    const chatControls = html.find('#chat-controls');
    if (!chatControls.length) {
      this.logger.error('No chat controls found');
      return;
    }

    const gmScreenBtn = $(`<a class="tcb-gm-screen-button" title="${game.i18n.localize('TCB_GMSCREEN.ToggleGMScreen')}">
      <i class="fas fa-book-open"></i>
    </a>`);

    chatControls.prepend(gmScreenBtn);
  }

  static createGMScreen() {
    this.logger.debug('Creating GM Screen');
    const numberOfColumns = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.NUMBER_OF_COLUMNS);
    const mode = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_MODE);
    const gmScreenHeight = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_HEIGHT);
    const leftMargin = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LEFT_MARGIN);
    const rightMargin = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_RIGHT_MARGIN);
    let defaultColumnWidth = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.DEFAULT_COLUMN_WIDTH);
    const expandBottomMode = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.EXPAND_BOTTOM_MODE);

    const layout = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT);

    // Calculate combined width of columns with width > 0 within the limit of numberOfColumns
    let combinedWidth = 0;
    for (let i = 1; i <= numberOfColumns; i++) {
      let columnWidth = layout[i]?.width || defaultColumnWidth;
      if (columnWidth <= 0) {
        columnWidth = defaultColumnWidth;
      }
      this.logger.debug('Added column to width calculation', columnWidth, combinedWidth);
      combinedWidth += columnWidth;
    }

    let gmScreenHtml = `<div id="tcb-gm-screen" class="tcb-app tcb-${mode}-mode" style="--gm-screen-height: ${gmScreenHeight}%; --number-of-columns: ${numberOfColumns}; --left-margin: ${leftMargin}px; --right-margin: ${rightMargin}px; --total-width: ${combinedWidth}px; --expand-bottom-mode: ${
      expandBottomMode ? 'true' : 'false'
    };">`;

    for (let i = 1; i <= numberOfColumns; i++) {
      const column = layout[i] || DEFAULT_COLUMN;
      gmScreenHtml += this.createColumnHTML(i, column);
    }

    gmScreenHtml += '</div>';

    $('#interface').append($(gmScreenHtml));

    // Initialize content for all columns
    for (let i = 1; i <= numberOfColumns; i++) {
      const column = layout[i] || DEFAULT_COLUMN;
      for (let row = 1; row <= column.rows; row++) {
        const defaultTab = this.getDefaultTab(i, row);
        this.switchTab(defaultTab, i, row);
      }
    }

    // Apply width to columns
    for (let i = 1; i <= numberOfColumns; i++) {
      const column = layout[i] || DEFAULT_COLUMN;
      const columnWidth = column.width && column.width > 0 ? column.width : defaultColumnWidth;
      if (columnWidth) {
        $(`#tcb-gm-screen .tcb-column[data-column="${i}"]`).css('width', `${columnWidth}px`);
      }
    }
  }

  static createColumnHTML(columnIndex, column) {
    let html = `<div class="tcb-column" data-column="${columnIndex}" data-width="${column.width}" style="width: ${
      column.width ? column.width + 'px' : 'auto'
    }">`;

    for (let row = 1; row <= column.rows; row++) {
      const defaultTab = this.getDefaultTab(columnIndex, row);
      html += `
        <div class="tcb-column-row" data-row="${row}">
          <header class="tcb-window-header">
            <div class="tcb-gm-screen-controls">
              ${
                columnIndex === 1 && row === 1
                  ? `<button class="tcb-settings-button" title="${game.i18n.localize(
                      'TCB_GMSCREEN.OpenSettings'
                    )}"><i class="fas fa-cog"></i></button>`
                  : ''
              }
              <button class="tcb-tab-toggle" title="${game.i18n.localize(
                'TCB_GMSCREEN.ChangeTab'
              )}"><i class="fas fa-chevron-down"></i> ${game.i18n.localize('TCB_GMSCREEN.Tab')} #${defaultTab}</button>
              <button class="tcb-edit-button" title="${game.i18n.localize(
                'TCB_GMSCREEN.EditCurrentTab'
              )}"><i class="fas fa-edit"></i></button>
            </div>
          </header>
          <div class="tcb-tab-container" style="display: none; position: absolute; width: 100%; z-index: 100;">
            <div class="tcb-tab-row">
              ${Array.from({ length: 6 }, (_, i) => i + 1)
                .map((tab) => `<button class="tcb-tab-button" data-tab="${tab}">${tab}</button>`)
                .join('')}
            </div>
            <div class="tcb-tab-row">
              ${Array.from({ length: 6 }, (_, i) => i + 7)
                .map((tab) => `<button class="tcb-tab-button" data-tab="${tab}">${tab}</button>`)
                .join('')}
            </div>
          </div>
          <section class="tcb-window-content"></section>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  static toggleTabContainer(event) {
    const $button = $(event.currentTarget);
    const $row = $button.closest('.tcb-column-row');
    const $tabContainer = $row.find('.tcb-tab-container');

    if ($tabContainer.is(':visible')) {
      $tabContainer.slideUp(100, () => {
        $tabContainer.css('display', 'none');
      });
    } else {
      $tabContainer.css('display', 'block').hide().slideDown(100);
    }
    $button.find('i').toggleClass('fa-chevron-down fa-chevron-up');
  }

  static toggleGMScreen() {
    this.logger.debug('Toggling GM Screen');
    let gmScreen = $(CSS.GM_SCREEN);
    if (gmScreen.length) {
      gmScreen.toggleClass('tcb-visible');
    } else {
      this.createGMScreen();
      gmScreen = $(CSS.GM_SCREEN);
      // Force a reflow before adding the visible class
      void gmScreen[0].offsetWidth;
      gmScreen.addClass('tcb-visible');
    }
  }

  static refreshGMScreen(setting, data) {
    this.logger.debug('Refreshing GM Screen');
    const gmScreen = $(CSS.GM_SCREEN);
    const wasVisible = gmScreen.hasClass('tcb-visible');
    gmScreen.remove();
    if (wasVisible) {
      this.createGMScreen();
      $(CSS.GM_SCREEN).addClass('tcb-visible');
    }
  }

  static handleTabClick(event) {
    const $button = $(event.currentTarget);
    const tab = $button.data('tab');
    const $row = $button.closest('.tcb-column-row');

    // Slide up the tab container
    const $tabContainer = $row.find('.tcb-tab-container');
    $tabContainer.slideUp(100, () => {
      $tabContainer.css('display', 'none');

      // Proceed with tab switch after the tab container has slid up
      const $column = $button.closest('.tcb-column');
      const columnIndex = $column.data('column');
      const rowIndex = $row.data('row');

      this.switchTab(tab, columnIndex, rowIndex);
      this.setDefaultTab(columnIndex, rowIndex, tab);

      // Update active state in the tab container
      $row.find('.tcb-tab-button').removeClass('tcb-active');
      $button.addClass('tcb-active');
    });
  }

  static async setDefaultTab(columnIndex, rowIndex, tab) {
    const defaultTabs = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS);
    if (!defaultTabs[columnIndex]) defaultTabs[columnIndex] = {};
    defaultTabs[columnIndex][rowIndex] = tab;
    await game.settings.set(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS, defaultTabs);
  }

  static getDefaultTab(columnIndex, rowIndex) {
    const defaultTabs = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_DEFAULT_TABS);
    return defaultTabs[columnIndex]?.[rowIndex] || 1;
  }

  static async switchTab(tab, columnIndex, rowIndex) {
    this.logger.debug(`Switching to tab ${tab} in column ${columnIndex}, row ${rowIndex}`);
    const content = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${tab}`);

    let renderedContent;
    if (this.isJournalEntryUUID(content)) {
      try {
        const journalEntry = await this.getJournalEntryByUUID(content);
        if (journalEntry) {
          renderedContent = await this.renderJournalEntry(journalEntry);
        }
      } catch (error) {
        console.error('Error rendering Journal Entry:', error);
      }
    }

    // If not a Journal Entry UUID or if there was an error, render as normal markdown
    if (!renderedContent) {
      renderedContent = await TextEditor.enrichHTML(marked.parse(content), { async: true });
    }

    const $content = $(
      `${CSS.GM_SCREEN} .tcb-column[data-column="${columnIndex}"] .tcb-column-row[data-row="${rowIndex}"] .tcb-window-content`
    );
    $content.html(renderedContent);

    // Update active state in the tab container
    const $row = $(
      `${CSS.GM_SCREEN} .tcb-column[data-column="${columnIndex}"] .tcb-column-row[data-row="${rowIndex}"]`
    );
    $row.find('.tcb-tab-button').removeClass('tcb-active');
    $row.find(`.tcb-tab-button[data-tab="${tab}"]`).addClass('tcb-active');
  }

  static initializeEditorDragDrop() {
    this.logger.info('Initializing editor drag and drop functionality');
    const textarea = document.querySelector(CSS.EDITOR_TEXTAREA);
    if (!textarea) {
      this.logger.error('Editor textarea not found');
      return;
    }

    textarea.addEventListener('dragover', this.handleDragOver.bind(this));
    textarea.addEventListener('drop', this.handleDrop.bind(this));
  }

  static handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  static async handleDrop(event) {
    this.logger.info('Handling drop event');
    event.preventDefault();

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (error) {
      this.logger.error('Failed to parse drop data:', error);
      return;
    }

    this.logger.debug('Dropped data:', data);

    if (!data) {
      this.logger.warn('No valid data in drop event');
      return;
    }

    let content = '';

    switch (data.type) {
      case 'JournalEntry':
        content = await this.handleJournalEntryDrop(data, event.target);
        break;
      case 'Actor':
        content = await this.handleActorDrop(data);
        break;
      case 'Item':
        content = await this.handleItemDrop(data);
        break;
      case 'RollTable':
        content = await this.handleRollTableDrop(data);
        break;
      case 'Scene':
        content = await this.handleSceneDrop(data);
        break;
      case 'Macro':
        content = await this.handleMacroDrop(data);
        break;
      default:
        this.logger.warn(`Unsupported drop type: ${data.type}`);
        new TriniumNotification({
          content: game.i18n.localize('TCB_GMSCREEN.UnsupportedContentType'),
          type: 'warning',
        }).show();
    }

    if (content) {
      this.insertContentAtCursor(event.target, content);
      this.updateEditorPreview();
      if (data.type !== 'JournalEntry') {
        new TriniumNotification({
          content: game.i18n.localize('TCB_GMSCREEN.ContentInserted'),
          type: 'success',
        }).show();
      }
    }
  }

  static async handleJournalEntryDrop(data, textarea) {
    this.logger.info('Handling Journal Entry drop');
    const journalEntry = await fromUuid(data.uuid);
    if (!journalEntry) {
      this.logger.error('Failed to retrieve Journal Entry:', data);
      new TriniumNotification({
        content: game.i18n.localize('TCB_GMSCREEN.FailedToInsertContent'),
        type: 'error',
      }).show();
      return null;
    }
    this.logger.debug('Journal Entry:', journalEntry);

    const currentContent = textarea.value.trim();
    if (currentContent) {
      const dialog = new TriniumConfirmationDialog({
        content: game.i18n.localize('TCB_GMSCREEN.ReplaceJournalContent'),
        callback: (confirmed) => {
          if (confirmed) {
            textarea.value = journalEntry.uuid;
            this.updateEditorPreview();
            new TriniumNotification({
              content: game.i18n.localize('TCB_GMSCREEN.ContentInserted'),
              type: 'success',
            }).show();
          } else {
            new TriniumNotification({
              content: game.i18n.localize('TCB_GMSCREEN.ActionCancelled'),
              type: 'info',
            }).show();
          }
        },
      });
      await dialog.render();
      return null;
    }

    new TriniumNotification({
      content: game.i18n.localize('TCB_GMSCREEN.ContentInserted'),
      type: 'success',
    }).show();
    return journalEntry.uuid;
  }

  static async handleActorDrop(data) {
    this.logger.info('Handling Actor drop');
    const actor = await fromUuid(data.uuid);
    if (!actor) {
      this.logger.error('Failed to retrieve Actor:', data);
      return '';
    }
    this.logger.debug('Actor:', actor);
    return `@UUID[${actor.uuid}]{${actor.name}}`;
  }

  static async handleItemDrop(data) {
    this.logger.info('Handling Item drop');
    const item = await fromUuid(data.uuid);
    if (!item) {
      this.logger.error('Failed to retrieve Item:', data);
      return '';
    }
    this.logger.debug('Item:', item);
    return `@UUID[${item.uuid}]{${item.name}}`;
  }

  static async handleRollTableDrop(data) {
    this.logger.info('Handling RollTable drop');
    const rollTable = await fromUuid(data.uuid);
    if (!rollTable) {
      this.logger.error('Failed to retrieve RollTable:', data);
      return '';
    }
    this.logger.debug('RollTable:', rollTable);
    return `@UUID[${rollTable.uuid}]{${rollTable.name}}`;
  }

  static async handleSceneDrop(data) {
    this.logger.info('Handling Scene drop');
    const scene = await fromUuid(data.uuid);
    if (!scene) {
      this.logger.error('Failed to retrieve Scene:', data);
      return '';
    }
    this.logger.debug('Scene:', scene);
    return `@UUID[${scene.uuid}]{${scene.name}}`;
  }

  static async handleMacroDrop(data) {
    this.logger.info('Handling Macro drop');
    const macro = game.macros.get(data.id);
    if (!macro) {
      this.logger.error('Failed to retrieve Macro:', data);
      return '';
    }
    this.logger.debug('Macro:', macro);
    return `@UUID[Macro.${macro.id}]{${macro.name}}`;
  }

  static insertContentAtCursor(textarea, content) {
    this.logger.info('Inserting content at cursor');
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const before = textarea.value.substring(0, startPos);
    const after = textarea.value.substring(endPos);

    textarea.value = before + content + after;
    textarea.selectionStart = textarea.selectionEnd = startPos + content.length;
    textarea.focus();
    this.logger.debug('Content inserted:', content);
  }

  static openEditor(event) {
    const $button = $(event.currentTarget);
    const $column = $button.closest('.tcb-column');
    const columnIndex = $column.data('column');
    const $row = $button.closest('.tcb-column-row');
    const rowIndex = $row.data('row');
    const activeTab = $row.find(`${CSS.TAB_BUTTON}.tcb-active`).data('tab');

    const content = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${activeTab}`);

    const rowHeight = $row.height();
    const rowWidth = $row.width();

    const editorHtml = `
      <div id="tcb-gm-screen-editor" class="tcb-app">
        <div class="tcb-editor-preview" style="width: ${rowWidth}px; position: relative;">
          <div class="tcb-editor-preview-content"></div>
          <div class="tcb-editor-preview-line" style="position: absolute; top: ${rowHeight}px; left: 0; right: 0;"></div>
        </div>
        <div class="tcb-editor-input">
          <div class="tcb-editor-header">
            <div class="tcb-editor-header-text">
          ${game.i18n.localize('TCB_GMSCREEN.EditorNote')} ${columnIndex} - ${rowIndex}. ${game.i18n.localize(
      'TCB_GMSCREEN.SelectTabToEdit'
    )}:
            </div>
          <div class="tcb-editor-tabs">
        ${Array.from({ length: 12 }, (_, i) => i + 1)
          .map(
            (tab) =>
              `<button class="tcb-editor-tab-button ${
                tab === activeTab ? 'tcb-active' : ''
              }" data-tab="${tab}">${game.i18n.localize('TCB_GMSCREEN.Tab')} ${tab}</button>`
          )
          .join('')}
      </div>
          </div>
          <textarea id="tcb-editor-textarea">${content}</textarea>
          <div class="tcb-editor-buttons">
            <button id="tcb-editor-save-close">${game.i18n.localize('TCB_GMSCREEN.SaveAndClose')}</button>
            <button id="tcb-editor-save">${game.i18n.localize('TCB_GMSCREEN.Save')}</button>
            <button id="tcb-editor-load-preset">${game.i18n.localize('TCB_GMSCREEN.LoadFromPreset')}</button>
            <button id="tcb-editor-cancel">${game.i18n.localize('TCB_GMSCREEN.Cancel')}</button>
          </div>
        </div>
      </div>
    `;

    $('body').append(editorHtml);

    this.initializeEditorDragDrop();

    this.updateEditorPreview();
  }

  static async handleEditorTabClick(event) {
    const $button = $(event.currentTarget);
    const newTab = $button.data('tab');
    const $activeTab = $('#tcb-gm-screen-editor .tcb-editor-tab-button.tcb-active');
    const currentTab = $activeTab.data('tab');

    if (newTab === currentTab) return;

    const currentContent = $(CSS.EDITOR_TEXTAREA).val();
    const savedContent = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${currentTab}`);

    if (currentContent !== savedContent) {
      const dialog = new TriniumConfirmationDialog({
        content: game.i18n.localize('TCB_GMSCREEN.UnsavedChangesConfirmation'),
        callback: (confirmed) => {
          if (confirmed) {
            this.switchEditorTab(newTab, $activeTab, $button);
          }
        },
      });
      dialog.render();
    } else {
      this.switchEditorTab(newTab, $activeTab, $button);
    }
  }

  static switchEditorTab(newTab, $activeTab, $button) {
    $activeTab.removeClass('tcb-active');
    $button.addClass('tcb-active');

    const newContent = game.settings.get(SETTINGS.MODULE_NAME, `gmScreenContent_tab${newTab}`);
    $(CSS.EDITOR_TEXTAREA).val(newContent);
    this.updateEditorPreview();
  }

  // Update the updateEditorPreview method
  static async updateEditorPreview() {
    const content = $(CSS.EDITOR_TEXTAREA).val();

    if (this.isJournalEntryUUID(content)) {
      try {
        const journalEntry = await this.getJournalEntryByUUID(content);
        if (journalEntry) {
          const renderedContent = await this.renderJournalEntry(journalEntry);
          $(`${CSS.EDITOR} .tcb-editor-preview-content`).html(renderedContent);
          return;
        }
      } catch (error) {
        console.error('Error rendering Journal Entry:', error);
      }
    }

    // If not a Journal Entry UUID or if there was an error, render as normal markdown
    const renderedContent = await TextEditor.enrichHTML(marked.parse(content), { async: true });
    $(`${CSS.EDITOR} .tcb-editor-preview-content`).html(renderedContent);
  }

  static async getJournalEntryByUUID(uuid) {
    try {
      const entry = await fromUuid(uuid);
      if (entry instanceof JournalEntry) {
        return entry;
      }
    } catch (error) {
      console.error('Error fetching Journal Entry:', error);
    }
    return null;
  }

  static async renderJournalEntry(journalEntry) {
    this.logger.debug('Rendering journal entry', { id: journalEntry.id, name: journalEntry.name });
    const renderer = new JournalEntryRenderer(journalEntry);
    const content = await renderer.render();

    const $content = $(content);
    this.addJournalEntryEventListeners($content, renderer);

    return $content;
  }

  static addJournalEntryEventListeners($content, renderer) {
    this.logger.debug('Adding journal entry event listeners');

    $content.off('click', '[data-action]');
    $content.off('click', '.page-link');

    this.initializeLazyLoading($content);

    $content.on('click', '[data-action]', this.handleJournalAction.bind(this, renderer));
    $content.on('click', '.page-link', this.handlePageLinkClick.bind(this, renderer));
  }

  static handlePageLinkClick(renderer, event) {
    event.preventDefault();
    const $target = $(event.currentTarget);
    const newPage = parseInt($target.data('page'), 10);
    this.changeJournalPage(renderer, newPage);
  }

  static handleJournalAction(renderer, event) {
    const $target = $(event.currentTarget);
    const action = $target.data('action');

    switch (action) {
      case 'expandContent':
        this.expandTruncatedContent(event);
        break;
      case 'loadMore':
        this.loadMoreJournalPages(renderer);
        break;
    }
  }

  static initializeLazyLoading($content) {
    this.logger.debug('Trinium Image Debugging: Initializing lazy loading for images');
    const observerOptions = {
      root: null,
      rootMargin: '100px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const container = entry.target;
          const img = container.querySelector('img');
          const overlay = container.querySelector('.image-loading-overlay');
          
          this.logger.debug('Trinium Image Debugging: Image intersecting viewport', { 
            containerId: container.id, 
            imageSrc: img.dataset.src 
          });

          const startTime = performance.now();
          img.onload = () => {
            const endTime = performance.now();
            this.logger.debug('Trinium Image Debugging: Image loaded', { 
              containerId: container.id, 
              imageSrc: img.src, 
              loadTime: endTime - startTime 
            });
            img.classList.remove('lazy-image');
            overlay.style.display = 'none';
          };

          img.onerror = () => {
            this.logger.error('Trinium Image Debugging: Image failed to load', { 
              containerId: container.id, 
              imageSrc: img.dataset.src 
            });
            overlay.textContent = 'Failed to load image';
          };

          this.logger.debug('Trinium Image Debugging: Starting to load image', { 
            containerId: container.id, 
            imageSrc: img.dataset.src 
          });
          img.src = img.dataset.src;
          observer.unobserve(container);
        }
      });
    }, observerOptions);

    $content.find('.image-container').each((index, container) => {
      this.logger.debug('Trinium Image Debugging: Observing image container', { containerId: container.id });
      observer.observe(container);
    });
  }

  static expandTruncatedContent(event) {
    const $button = $(event.currentTarget);
    const $truncated = $button.siblings('.truncated-content');
    const $full = $button.siblings('.full-content');

    this.logger.debug('Expanding truncated content');
    $truncated.hide();
    $full.show();
    $button.remove();
  }

  static async loadMoreJournalPages(renderer) {
    this.logger.debug('Loading more journal pages', { currentPageSize: renderer.pageSize });
    renderer.pageSize += 3;
    await this.updateJournalContent(renderer);
  }

  static async changeJournalPage(renderer, newPage) {
    this.logger.debug('Changing journal page', { oldPage: renderer.currentPage, newPage });
    renderer.currentPage = newPage;
    renderer.pageSize = 3;
    await this.updateJournalContent(renderer);
  }

  static async updateJournalContent(renderer) {
    this.logger.debug('Updating journal content', {
      journalId: renderer.journalEntry.id,
      currentPage: renderer.currentPage,
      pageSize: renderer.pageSize,
    });
    const newContent = await renderer.renderMultiplePages();
    const $content = $(CSS.GM_SCREEN).find(`.journal-entry-content[data-entry-id="${renderer.journalEntry.id}"]`);
    $content.html(newContent);
    this.addJournalEntryEventListeners($content, renderer);
  }

  static isJournalEntryUUID(content) {
    return /^JournalEntry\.[a-zA-Z0-9]{16}$/.test(content.trim());
  }

  static async saveEditor(close) {
    this.logger.debug('Saving editor content');
    const content = $(CSS.EDITOR_TEXTAREA).val();
    const activeTab = $(`${CSS.GM_SCREEN} ${CSS.TAB_BUTTON}.tcb-active`).data('tab');
    await game.settings.set(SETTINGS.MODULE_NAME, `gmScreenContent_tab${activeTab}`, content);
    this.switchTab(activeTab, 1); // Assuming we're always editing the first column
    if (close) {
      this.closeEditor();
    }
  }

  static closeEditor() {
    $(CSS.EDITOR).remove();
    this.refreshGMScreen();
  }

  static handleLoadPreset(event) {
    event.preventDefault();
    const presetOptions = Object.entries(GM_SCREEN_PRESETS)
      .map(([key, preset]) => `<option value="${key}">${preset.name}</option>`)
      .join('');

    const dropdownHtml = `
      <div id="tcb-preset-dropdown-container" class="tcb-dropdown">
        <select id="tcb-preset-dropdown">
          <option value="">${game.i18n.localize('TCB_GMSCREEN.SelectPreset')}</option>
          ${presetOptions}
        </select>
      </div>
    `;

    const $loadPresetButton = $('#tcb-editor-load-preset');
    $loadPresetButton.after(dropdownHtml);

    const $dropdown = $('#tcb-preset-dropdown');
    $dropdown.on('change', (e) => {
      const selectedPreset = e.target.value;
      if (selectedPreset) {
        const presetContent = GM_SCREEN_PRESETS[selectedPreset].content;
        const currentContent = $('#tcb-editor-textarea').val();
        $('#tcb-editor-textarea').val(currentContent + '\n\n' + presetContent.trim());
        this.updateEditorPreview();
        $dropdown.val('');
      }
      $('#tcb-preset-dropdown-container').remove();
    });
  }

  static openSettings() {
    this.logger.debug('Opening GM Screen settings');
    const layout = game.settings.get(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT);

    const settingsHtml = `
      <div id="tcb-gm-screen-settings">
        <header class="tcb-window-header">
          <h2>${game.i18n.localize('TCB_GMSCREEN.GMScreenSettings')}</h2>
          <button class="tcb-close-settings">&times;</button>
        </header>
        <div class="tcb-window-content">
          <form id="tcb-gm-screen-settings-form">
            <div class="tcb-settings-scrollable">
              ${this.generateGeneralSettingsFields()}
              <hr>
              <h3>${game.i18n.localize('TCB_GMSCREEN.ColumnSettings')}</h3>
              ${[1, 2, 3, 4]
                .map(
                  (i) => `
                <fieldset>
                  <legend>${game.i18n.localize('TCB_GMSCREEN.Column')} ${i}</legend>
                  <div class="form-group">
                    <label for="tcb-column-rows-${i}">${game.i18n.localize('TCB_GMSCREEN.NumberOfRows')}</label>
                    <input type="number" id="tcb-column-rows-${i}" name="column[${i}].rows" value="${
                    layout[i]?.rows || 1
                  }" min="1" max="3" required>
                  </div>
                  <div class="form-group">
                    <label for="tcb-column-width-${i}">${game.i18n.localize('TCB_GMSCREEN.ColumnWidth')}</label>
                    <input type="number" id="tcb-column-width-${i}" name="column[${i}].width" value="${
                    layout[i]?.width || 0
                  }" min="0" max="1000" step="10" required>
                  </div>
                </fieldset>
              `
                )
                .join('')}
            </div>
            <div class="tcb-settings-buttons">
              <button type="submit" id="tcb-save-close-settings">${game.i18n.localize(
                'TCB_GMSCREEN.SaveAndClose'
              )}</button>
              <button type="button" id="tcb-save-settings">${game.i18n.localize('TCB_GMSCREEN.Save')}</button>
              <button type="button" class="tcb-close-settings">${game.i18n.localize('TCB_GMSCREEN.Cancel')}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const $settingsPanel = $(settingsHtml);
    $('body').append($settingsPanel);

    this.initializeDraggableSettings($settingsPanel[0]);
  }

  static validateSettingsForm(form) {
    if (form.checkValidity()) {
      return true;
    } else {
      form.reportValidity();
      return false;
    }
  }

  static validateSettingsForm(form) {
    if (form.checkValidity()) {
      return true;
    } else {
      form.reportValidity();
      return false;
    }
  }

  static initializeDraggableSettings(settingsPanel) {
    const header = settingsPanel.querySelector('.tcb-window-header');
    new Draggable(settingsPanel, header);
  }

  static generateGeneralSettingsFields() {
    const settings = [
      {
        key: SETTINGS.NUMBER_OF_COLUMNS,
        type: 'number',
        label: 'TCB_SETTINGS.NumberOfColumns',
        hint: 'TCB_SETTINGS.NumberOfColumnsHint',
        min: 1,
        max: 4,
        step: 1,
      },
      {
        key: SETTINGS.GM_SCREEN_MODE,
        type: 'select',
        label: 'TCB_SETTINGS.GMScreenMode',
        hint: 'TCB_SETTINGS.GMScreenModeHint',
        options: ['right-side', 'left-side', 'bottom'],
      },
      {
        key: SETTINGS.DEFAULT_COLUMN_WIDTH,
        type: 'number',
        label: 'TCB_SETTINGS.DefaultColumnWidth',
        hint: 'TCB_SETTINGS.DefaultColumnWidthHint',
        min: 100,
        max: 1000,
        step: 10,
      },
      {
        key: SETTINGS.GM_SCREEN_HEIGHT,
        type: 'number',
        label: 'TCB_SETTINGS.GMScreenHeight',
        hint: 'TCB_SETTINGS.GMScreenHeightHint',
        min: 10,
        max: 100,
        step: 5,
      },
      {
        key: SETTINGS.GM_SCREEN_LEFT_MARGIN,
        type: 'number',
        label: 'TCB_SETTINGS.GMScreenLeftMargin',
        hint: 'TCB_SETTINGS.GMScreenLeftMarginHint',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: SETTINGS.GM_SCREEN_RIGHT_MARGIN,
        type: 'number',
        label: 'TCB_SETTINGS.GMScreenRightMargin',
        hint: 'TCB_SETTINGS.GMScreenRightMarginHint',
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: SETTINGS.EXPAND_BOTTOM_MODE,
        type: 'checkbox',
        label: 'TCB_SETTINGS.ExpandBottomMode',
        hint: 'TCB_SETTINGS.ExpandBottomModeHint',
      },
    ];

    return settings
      .map((setting) => {
        const value = game.settings.get(SETTINGS.MODULE_NAME, setting.key);
        let inputHtml;

        if (setting.type === 'select') {
          inputHtml = `
          <select id="${setting.key}" name="${setting.key}" required>
            ${setting.options
              .map(
                (option) =>
                  `<option value="${option}" ${value === option ? 'selected' : ''}>${game.i18n.localize(
                    `TCB_GMSCREEN.${option}`
                  )}</option>`
              )
              .join('')}
          </select>
        `;
        } else if (setting.type === 'checkbox') {
          inputHtml = `
          <input type="checkbox" id="${setting.key}" name="${setting.key}" ${value ? 'checked' : ''}>
        `;
        } else {
          inputHtml = `
          <input type="${setting.type}" id="${setting.key}" name="${setting.key}" value="${value}"
                 min="${setting.min}" max="${setting.max}" step="${setting.step}" required>
        `;
        }

        return `
        <div class="form-group">
          <label for="${setting.key}">${game.i18n.localize(setting.label)}</label>
          ${inputHtml}
          <p class="notes">${game.i18n.localize(setting.hint)}</p>
        </div>
      `;
      })
      .join('');
  }

  static validateSetting(settingKey, value) {
    const setting = game.settings.settings.get(`${SETTINGS.MODULE_NAME}.${settingKey}`);
    if (setting.type === Number) {
      const min = setting.range?.min ?? Number.MIN_SAFE_INTEGER;
      const max = setting.range?.max ?? Number.MAX_SAFE_INTEGER;
      return Math.clamped(Number(value), min, max);
    }
    return value;
  }

  static async saveSettings(event) {
    event.preventDefault();
    this.logger.debug('Saving GM Screen settings');

    const form = document.getElementById('tcb-gm-screen-settings-form');
    const formData = new FormData(form);

    // Save general settings
    const generalSettings = [
      SETTINGS.NUMBER_OF_COLUMNS,
      SETTINGS.GM_SCREEN_MODE,
      SETTINGS.GM_SCREEN_HEIGHT,
      SETTINGS.GM_SCREEN_LEFT_MARGIN,
      SETTINGS.GM_SCREEN_RIGHT_MARGIN,
      SETTINGS.DEFAULT_COLUMN_WIDTH,
    ];

    for (const setting of generalSettings) {
      let value = formData.get(setting);
      if (setting !== SETTINGS.GM_SCREEN_MODE) {
        value = Number(value);
      }
      await game.settings.set(SETTINGS.MODULE_NAME, setting, value);
    }

    // Handle Expand Bottom Mode checkbox
    const expandBottomMode = formData.get(SETTINGS.EXPAND_BOTTOM_MODE) === 'on';
    await game.settings.set(SETTINGS.MODULE_NAME, SETTINGS.EXPAND_BOTTOM_MODE, expandBottomMode);

    // Save layout settings
    const newLayout = {};
    for (let [key, value] of formData.entries()) {
      if (key.startsWith('column')) {
        const match = key.match(/column\[(\d+)\]\.(\w+)/);
        if (match) {
          const [, columnIndex, property] = match;
          newLayout[columnIndex] = newLayout[columnIndex] || {};
          newLayout[columnIndex][property] = parseInt(value);
        }
      }
    }
    await game.settings.set(SETTINGS.MODULE_NAME, SETTINGS.GM_SCREEN_LAYOUT, newLayout);

    this.refreshGMScreen();
    ui.notifications.info(game.i18n.localize('TCB_GMSCREEN.SettingsSaved'));

    return newLayout;
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

export function init() {
  GMScreen.init();
}