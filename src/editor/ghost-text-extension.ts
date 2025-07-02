import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { StateField, Annotation } from '@codemirror/state';

const ghostTextAnnotation = Annotation.define<{ pos: number; text: string } | null>();

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
			const newPos = tr.changes.mapPos(value.pos);
			if (newPos === null) return null;
			return { ...value, pos: newPos };
		}

		if (tr.selection && value) {
			if (tr.selection.main.head !== value.pos) {
				return null;
			}
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

export function setGhostText(view: EditorView, text: string | null) {
	const pos = view.state.selection.main.head;
	const payload = text ? { pos, text } : null;
	view.dispatch({
		annotations: ghostTextAnnotation.of(payload),
	});
}

export function clearGhostText(view: EditorView) {
	setGhostText(view, null);
}
