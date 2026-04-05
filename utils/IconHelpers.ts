export const generateBusIconHtml = (id: string, bearing: number) => {
    const displayId = id.replace('VH', '');
    const snappedBearing = Math.round(bearing / 90) * 90;
    
    return `
      <div id="bus-wrapper-${id}" style="
        position: relative;
        width: 36px;
        height: 44px;
        transform: rotate(${bearing}deg);
        transition: transform 0.4s ease-out;
        filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.4));
      ">
        <svg viewBox="0 0 32 40" style="position: absolute; width: 36px; height: 44px; top: 0; left: 0;">
          <path d="M16 0 C 5 12 0 19 0 24 C 0 32.837 7.163 40 16 40 C 24.837 40 32 32.837 32 24 C 32 19 27 12 16 0 Z" fill="#1A2B56" stroke="white" stroke-width="1.5"/>
          <text
            id="bus-text-${id}"
            x="16"
            y="24"
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            font-weight="800"
            font-size="10"
            font-family="sans-serif"
            transform="rotate(${-snappedBearing}, 16, 24)"
          >${displayId}</text>
        </svg>
      </div>
    `;
  };