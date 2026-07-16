local SheetInfo = {}

SheetInfo.sheet =
{
    frames =
    {
        {
            -- hero&boss.png
            x = 14,
            y = 22,
            width = 20,
            height = 12,
            sourceX = 4,
            sourceY = 6,
            sourceWidth = 32,
            sourceHeight = 28,
        }
    },
    sheetContentWidth = 128,
    sheetContentHeight = 96,
}

SheetInfo.frameIndex =
{
    ["hero&boss.png"] = 1,
}

function SheetInfo:getSheet()
    return self.sheet
end

function SheetInfo:getFrameIndex(name)
    return self.frameIndex[name]
end

return SheetInfo
