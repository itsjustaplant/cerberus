import { useId } from "react";

export function CerberusMark() {
  const id = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="36"
      height="36"
      viewBox="0 0 1254 1254"
      aria-hidden="true"
      className="cerberus-logo"
    >
      <defs>
        <linearGradient
          id={`${id}-fire`}
          x1="0"
          y1="690"
          x2="0"
          y2="72"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffe500" />
          <stop offset="0.24" stopColor="#ffd000" />
          <stop offset="0.52" stopColor="#ff7900" />
          <stop offset="0.76" stopColor="#ff3000" />
          <stop offset="1" stopColor="#f00000" />
        </linearGradient>
        <mask
          id={`${id}-eyes`}
          maskUnits="userSpaceOnUse"
          x="190"
          y="420"
          width="860"
          height="340"
        >
          <rect x="190" y="420" width="860" height="340" fill="black" />
          <g fill="white">
            <ellipse cx="562" cy="508" rx="60" ry="65" />
            <ellipse cx="696" cy="495" rx="59" ry="64" />
            <ellipse cx="255" cy="684" rx="45" ry="52" />
            <ellipse cx="359" cy="674" rx="47" ry="53" />
            <ellipse cx="882" cy="687" rx="44" ry="54" />
            <ellipse cx="991" cy="671" rx="44" ry="49" />
          </g>
          <g fill="black">
            <circle cx="597" cy="479" r="28" />
            <circle cx="731" cy="467" r="27" />
            <circle cx="282" cy="659" r="24" />
            <circle cx="387" cy="647" r="23" />
            <circle cx="911" cy="658" r="24" />
            <circle cx="1019" cy="647" r="23" />
          </g>
        </mask>
      </defs>
      <path
        className="cerberus-flame"
        fill={`url(#${id}-fire)`}
        d="M177 697 C113 606 159 466 239 374 C270 338 307 299 334 281 C347 273 355 280 350 295 C330 348 333 387 380 406 C365 318 425 244 491 211 C564 176 611 139 598 87 C592 65 605 69 620 76 C690 104 734 149 766 208 C803 255 869 310 863 410 C914 374 913 327 903 294 C898 277 907 273 920 280 C1014 332 1082 448 1093 549 C1098 602 1084 652 1064 696 Z"
      />
      <path
        className="cerberus-guardian"
        fill="#101010"
        d="M405 429 C400 392 421 345 443 304 C460 271 478 248 499 250 C532 251 566 308 590 350 L662 350 C690 305 716 251 754 250 C786 249 809 299 825 344 C843 392 852 443 833 466 L820 481 C828 506 834 534 837 560 C864 548 882 546 905 551 C938 507 965 473 990 475 C1019 478 1043 531 1053 572 C1060 599 1057 622 1045 638 C1058 659 1062 677 1070 688 C1089 698 1116 714 1132 732 C1163 777 1101 828 1037 847 C1013 854 985 858 962 858 C953 873 964 894 967 920 C980 992 944 1036 870 1048 C831 1055 790 1055 745 1055 L421 1055 C359 1055 316 1047 294 1012 C273 982 279 936 295 893 C299 881 302 868 302 859 C256 858 205 846 162 819 C129 798 108 773 115 747 C120 722 155 705 177 692 C189 685 192 675 198 660 L209 639 C182 623 184 590 197 555 C212 511 236 475 261 475 C289 476 312 522 337 548 C362 545 386 549 408 558 C411 529 416 500 429 478 C412 468 407 451 405 429 Z"
      />
      <rect
        x="190"
        y="420"
        width="860"
        height="340"
        fill="#fafafa"
        className="cerberus-eyes"
        mask={`url(#${id}-eyes)`}
      />
    </svg>
  );
}
