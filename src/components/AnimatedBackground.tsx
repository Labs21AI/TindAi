"use client";

import { useEffect, useRef } from "react";

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  opacity: number;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Matrix characters (binary + some special chars)
    const chars = "01";
    const fontSize = 14;
    const columns: MatrixColumn[] = [];

    // Initialize columns
    const initColumns = () => {
      columns.length = 0;
      const columnCount = Math.floor(canvas.width / fontSize);
      for (let i = 0; i < columnCount; i++) {
        // Random chance to have a column (sparse effect)
        if (Math.random() > 0.7) {
          columns.push({
            x: i * fontSize,
            y: Math.random() * canvas.height,
            speed: 0.5 + Math.random() * 2,
            chars: Array.from({ length: 20 }, () => 
              chars[Math.floor(Math.random() * chars.length)]
            ),
            opacity: 0.1 + Math.random() * 0.3,
          });
        }
      }
    };
    initColumns();

    // Animation loop
    let animationId: number;
    const animate = () => {
      // Semi-transparent black to create trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      columns.forEach((column) => {
        column.chars.forEach((char, index) => {
          const y = column.y + index * fontSize;
          
          // Gradient from bright green at bottom to dark at top
          const brightness = (index / column.chars.length);
          const green = Math.floor(100 + brightness * 155);
          ctx.fillStyle = `rgba(${Math.floor(green * 0.3)}, ${green}, ${Math.floor(green * 0.3)}, ${column.opacity * brightness})`;
          ctx.font = `${fontSize}px monospace`;
          ctx.fillText(char, column.x, y);
        });

        // Move column down
        column.y += column.speed;

        // Reset when off screen
        if (column.y > canvas.height) {
          column.y = -column.chars.length * fontSize;
          // Randomize characters
          column.chars = column.chars.map(() => 
            chars[Math.floor(Math.random() * chars.length)]
          );
        }

        // Occasionally change a character
        if (Math.random() > 0.98) {
          const idx = Math.floor(Math.random() * column.chars.length);
          column.chars[idx] = chars[Math.floor(Math.random() * chars.length)];
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.4 }}
    />
  );
}
