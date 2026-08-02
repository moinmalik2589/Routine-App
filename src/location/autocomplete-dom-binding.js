export class LocationAutocompleteDomBinding {
  constructor({ input, results, documentTarget = document, controller, onQueryChanged = () => {}, onSelect }) {
    this.inputElement = input; this.resultsElement = results; this.documentTarget = documentTarget; this.controller = controller; this.onQueryChanged = onQueryChanged; this.onSelect = onSelect; this.destroyed = false;
    this.handleInput = (event) => { this.onQueryChanged(event.currentTarget.value); this.controller.input(event.currentTarget.value); };
    this.handleKeydown = (event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.controller.move(event.key === 'ArrowDown' ? 1 : -1); } else if (event.key === 'Enter') { const item = this.controller.current(); if (item) { event.preventDefault(); void this.onSelect(item); } } else if (event.key === 'Escape') this.controller.escape(); };
    this.handlePointerDown = (event) => { const button = event.target.closest?.('[data-location-index]'); if (!button) return; event.preventDefault(); const item = this.controller.state.results[Number(button.dataset.locationIndex)]; if (item) void this.onSelect(item); };
    this.handleOutsidePointerDown = (event) => { if (!this.inputElement.closest('.location-search')?.contains(event.target) && !this.resultsElement.contains(event.target)) this.controller.escape(); };
    input.addEventListener('input', this.handleInput); input.addEventListener('keydown', this.handleKeydown); results.addEventListener('pointerdown', this.handlePointerDown); documentTarget.addEventListener('pointerdown', this.handleOutsidePointerDown);
  }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.inputElement.removeEventListener('input', this.handleInput); this.inputElement.removeEventListener('keydown', this.handleKeydown); this.resultsElement.removeEventListener('pointerdown', this.handlePointerDown); this.documentTarget.removeEventListener('pointerdown', this.handleOutsidePointerDown); this.controller.destroy(); }
}
