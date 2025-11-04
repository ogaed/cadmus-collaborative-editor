interface WordCountProps {
  text: string
}

export function countWords(text: string): number {
  if (!text) return 0
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  return tokens.length
}

export default function WordCount({ text }: WordCountProps) {
  const words = countWords(text)
  const chars = text.length

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm text-foreground">
      <span className="font-medium">
        {words} {words === 1 ? "word" : "words"}
      </span>
      <span className="hidden sm:inline text-muted-foreground">•</span>
      <span className="hidden sm:inline text-muted-foreground">
        {chars} {chars === 1 ? "character" : "characters"}
      </span>
    </div>
  )
}
