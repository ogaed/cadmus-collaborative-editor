
import { Button } from "./ui/button" 

interface ToolbarProps {
  onBold: () => void
  onItalic: () => void
}

export default function Toolbar({ onBold, onItalic }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4">
      <Button
        onClick={onBold}
        variant="outline"
        size="sm"
        className="text-xs sm:text-sm font-semibold bg-card hover:bg-accent"
        type="button"
        title="Bold"
      >
        <span className="font-bold">B</span>
        <span className="ml-1.5 hidden sm:inline">Bold</span>
      </Button>
      <Button
        onClick={onItalic}
        variant="outline"
        size="sm"
        className="text-xs sm:text-sm bg-card hover:bg-accent"
        type="button"
        title="Italic"
      >
        <span className="italic font-serif">I</span>
        <span className="ml-1.5 hidden sm:inline">Italic</span>
      </Button>
      <span className="hidden md:inline text-xs text-muted-foreground ml-2">(wraps selection)</span>
    </div>
  )
}
