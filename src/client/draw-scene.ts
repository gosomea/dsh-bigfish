export function drawSceneProps(
  c: CanvasRenderingContext2D,
  theme: string,
  t: number,
  activity: number,
  front: boolean,
) {
  c.save();
  c.lineWidth = 2;
  c.strokeStyle = "#7d92bb";
  if (!front) {
    c.fillStyle = "#5276b51b";
    c.beginPath();
    c.ellipse(233, 221, 89, 12, 0, 0, Math.PI * 2);
    c.fill();
    if (theme === "library") {
      for (let i = 0; i < 5; i++) {
        c.fillStyle = ["#8eaad1", "#decbae", "#b4c7e2"][i % 3]!;
        c.fillRect(130 + i * 13, 161 - (i % 2) * 15, 10, 46 + (i % 2) * 15);
      }
    }
    if (theme === "workshop") {
      c.fillStyle = "#a9bddb";
      c.fillRect(126, 190, 32, 29);
      c.strokeRect(126, 190, 32, 29);
      c.beginPath();
      c.moveTo(136, 190);
      c.lineTo(136, 181);
      c.lineTo(148, 181);
      c.lineTo(148, 190);
      c.stroke();
    }
    if (theme === "rest") {
      c.fillStyle = "#c5d4e9";
      c.beginPath();
      c.ellipse(238, 218, 84, 14, 0, 0, 7);
      c.fill();
    }
    if (theme === "delivery") {
      c.fillStyle = "#96b2db";
      c.fillRect(140, 223, 187, 6);
    }
  } else {
    if (theme === "desk") {
      c.fillStyle = "#c5d6ed";
      c.fillRect(131, 204, 203, 10);
      c.fillStyle = "#849fc6";
      c.fillRect(140, 214, 7, 17);
      c.fillRect(321, 214, 7, 17);
      c.fillStyle = "#eef4fe";
      c.fillRect(172, 198, 83, 6);
      c.fillStyle = "#8b9ebd";
      for (let i = 0; i < 10; i++) c.fillRect(176 + i * 7, 199, 4, 2);
      c.fillStyle = "#e3c69b";
      c.fillRect(298, 188, 16, 16);
      c.strokeRect(312, 192, 7, 7);
    }
    if (theme === "treadmill") {
      c.fillStyle = "#7b97bf";
      c.fillRect(141, 213, 187, 13);
      c.fillStyle = "#dbe7f9";
      const scroll = (t * (15 + 25 * activity)) % 22;
      for (let i = 0; i < 8; i++) c.fillRect(146 + i * 22 - scroll, 217, 12, 3);
      c.beginPath();
      c.moveTo(327, 214);
      c.lineTo(327, 147);
      c.lineTo(306, 147);
      c.stroke();
    }
  }
  c.restore();
}
