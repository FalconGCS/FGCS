export default function ContextMenuItem({ children, onClick, disabled }) {
  return (
    <div
      className={
        disabled
          ? "py-1 px-4 rounded opacity-40 cursor-not-allowed"
          : "hover:bg-falcongrey-800 hover:cursor-pointer py-1 px-4 rounded"
      }
      onClick={disabled ? undefined : onClick}
    >
      <div className="w-full flex justify-between gap-2">{children}</div>
    </div>
  )
}
