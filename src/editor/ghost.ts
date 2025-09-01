import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { StateField, Annotation } from '@codemirror/state';

const ghostTextAnnotation = Annotation.define<{ pos: number; text: string } | null>();

/** State field that manages ghost text display in CodeMirror editor. */
export const ghostTextState = StateField.define<{ pos: number; text: string } | null>({
	create() {
		return null;
	},
	update(value, tr) {
		const annotation = tr.annotation(ghostTextAnnotation);
		if (annotation !== undefined) {
			return annotation;
		}

		if (tr.docChanged && value) {
			const newPos = tr.changes.mapPos(value.pos, 1);
			if (newPos === null) return null;
			return { ...value, pos: newPos };
		}
		return value;
	},
	provide: (f) =>
		EditorView.decorations.from(f, (value) => {
			if (!value || !value.text) {
				return Decoration.none;
			}
			const widget = new GhostTextWidget(value.text);
			return Decoration.set([
				Decoration.widget({
					widget,
					side: 1,
				}).range(value.pos),
			]);
		}),
});

/** Widget for rendering ghost text in the editor. */
class GhostTextWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.className = 'cm-ghost-text';
		span.textContent = this.text;
		return span;
	}

	ignoreEvent() {
		return true;
	}
}

/** Sets or clears ghost text at the current cursor position. */
export function setGhostText(view: EditorView, pos: number, text: string | null) {
	view.dispatch({
		annotations: [ghostTextAnnotation.of(text ? { pos, text } : null)],
	});
}

/** Clears all ghost text from the editor view. */
export function clearGhostText(view: EditorView) {
	view.dispatch({
		annotations: [ghostTextAnnotation.of(null)],
	});
}
