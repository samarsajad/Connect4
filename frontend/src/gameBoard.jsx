function GameBoard({ board, onMove }) {
  const handleClick = (c) => {
    console.log("Cell clicked, column:", c);
    onMove(c);
  };

  return (
    <div style={{
      display: "inline-block",
      background: "linear-gradient(135deg, #1e3a8a, #1e40af)",
      padding: "15px",
      borderRadius: "12px",
      boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)"
    }}>
      {board.map((row, r) => (
        <div key={r} style={{ display: "flex" }}>
          {row.map((cell, c) => (
            <div
              key={c}
              onClick={() => handleClick(c)}
              style={{
                width: 60,
                height: 60,
                margin: 4,
                borderRadius: "50%",
                background: cell === "P1" 
                  ? "radial-gradient(circle at 30% 30%, #ff8a8a, #dc2626, #991b1b)" 
                  : cell === "P2" 
                  ? "radial-gradient(circle at 30% 30%, #fef08a, #eab308, #a16207)" 
                  : "radial-gradient(circle at 30% 30%, #374151, #1f2937, #111827)",
                cursor: "pointer",
                boxShadow: cell 
                  ? "inset 0 -4px 8px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.3)"
                  : "inset 0 4px 8px rgba(0,0,0,0.5)",
                border: "3px solid rgba(255,255,255,0.1)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease"
              }}
              onMouseEnter={(e) => {
                if (!cell) {
                  e.target.style.transform = "scale(1.05)";
                  e.target.style.boxShadow = "inset 0 4px 8px rgba(0,0,0,0.5), 0 0 15px rgba(255,255,255,0.2)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "scale(1)";
                e.target.style.boxShadow = cell 
                  ? "inset 0 -4px 8px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.3)"
                  : "inset 0 4px 8px rgba(0,0,0,0.5)";
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default GameBoard;
