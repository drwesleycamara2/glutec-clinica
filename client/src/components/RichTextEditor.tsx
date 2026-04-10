import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import FontFamily from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import { Button } from "@/components/ui/button";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./RichTextEditor.css";

interface RichTextEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  minHeight?: string;
}

function renderTextStyleAttrs(attributes: { color?: string | null; fontSize?: string | null }) {
  const styles: string[] = [];
  if (attributes.color) {
    styles.push(`color: ${attributes.color}`);
  }
  if (attributes.fontSize) {
    styles.push(`font-size: ${attributes.fontSize}`);
  }
  return styles.length > 0 ? { style: styles.join("; ") } : {};
}

const StyledText = TextStyle.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
        renderHTML: (attributes) => renderTextStyleAttrs(attributes),
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => renderTextStyleAttrs(attributes),
      },
    };
  },
});

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Digite o conteúdo da prescrição...",
  minHeight = "200px",
}: RichTextEditorProps) {
  const [fontSize, setFontSize] = useState("14px");
  const [textColor, setTextColor] = useState("#111827");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right" | "justify">("left");
  const [lastSelection, setLastSelection] = useState<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      StyledText,
      FontFamily.configure({
        types: ["textStyle"],
      }),
    ],
    content: value,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none p-4 rounded-lg border border-input bg-background text-foreground",
        style: `font-family: 'Montserrat', sans-serif; min-height: ${minHeight}; font-size: 14px; text-align: ${textAlign};`,
        "data-placeholder": placeholder,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom as HTMLElement;
    element.style.textAlign = textAlign;
  }, [editor, textAlign]);

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  const fontSizes = ["12px", "14px", "16px", "18px", "20px", "24px"];

  const restoreSelection = () => {
    if (!lastSelection) return editor.chain().focus();
    return editor.chain().focus().setTextSelection(lastSelection);
  };

  const applyColor = (nextColor: string) => {
    setTextColor(nextColor);
    restoreSelection().setMark("textStyle", { color: nextColor }).run();
  };

  const applyFontSize = (nextSize: string) => {
    setFontSize(nextSize);
    restoreSelection().setMark("textStyle", { fontSize: nextSize }).run();
  };

  return (
    <div className="space-y-2 overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
        <Select value={fontSize} onValueChange={applyFontSize}>
          <SelectTrigger className="h-9 w-24">
            <SelectValue placeholder="Tamanho" />
          </SelectTrigger>
          <SelectContent>
            {fontSizes.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-6 w-px bg-border" />

        <input
          type="color"
          value={textColor}
          onMouseDown={() => setLastSelection(editor.state.selection)}
          onChange={(event) => applyColor(event.target.value)}
          className="h-9 w-10 rounded border border-border bg-background p-1"
          title="Cor do texto"
        />

        <div className="h-6 w-px bg-border" />

        <Button
          size="sm"
          variant={editor.isActive("bold") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="h-9 w-9 p-0"
          title="Negrito"
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant={editor.isActive("italic") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="h-9 w-9 p-0"
          title="Itálico"
        >
          <Italic className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          size="sm"
          variant={textAlign === "left" ? "default" : "outline"}
          onClick={() => setTextAlign("left")}
          className="h-9 w-9 p-0"
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={textAlign === "center" ? "default" : "outline"}
          onClick={() => setTextAlign("center")}
          className="h-9 w-9 p-0"
          title="Centralizar"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={textAlign === "right" ? "default" : "outline"}
          onClick={() => setTextAlign("right")}
          className="h-9 w-9 p-0"
          title="Alinhar à direita"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={textAlign === "justify" ? "default" : "outline"}
          onClick={() => setTextAlign("justify")}
          className="h-9 px-3"
          title="Justificar"
        >
          J
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          size="sm"
          variant={editor.isActive("bulletList") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="h-9 w-9 p-0"
          title="Lista com marcadores"
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant={editor.isActive("orderedList") ? "default" : "outline"}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="h-9 w-9 p-0"
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-9 w-9 p-0"
          title="Desfazer"
        >
          <Undo2 className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-9 w-9 p-0"
          title="Refazer"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
