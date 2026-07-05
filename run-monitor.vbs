' Ukryte uruchomienie monitora (bez migajacego okna konsoli) - dla Harmonogramu zadan
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Users\bkawa\AppData\Local\nvs\default\node.exe"" ""C:\Users\bkawa\zory-monitor\monitor.mjs""", 0, False
