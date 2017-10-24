#!/bin/bash
[ -z "$SOURCE_DTS" ] && /opt/dtb-rebuilder/src/arm/am335x-bone-bela.dts
TMP=/tmp/parsedtsmp 
TMP2=/tmp/parsedtsmp2
PINMUX_FROM_DTS=pinmux-from-dts
PINMUX_REFERENCE=pinmux-bela-reference

grep -o "^\s*0x[0-9a-fA-F]*\s0x[0-9a-fA-F]*" "$SOURCE_DTS" | sed "s/^\s*//" | sed "s/0x\([0-9]\)/\1 /" | sed s/0x// > $TMP
sort $TMP > $TMP2
print > $PINMUX_FROM_DTS
while read
do
	A=`echo $REPLY | cut -f 1 -d " " `
	A=$((A+8))
	B=`echo $REPLY | cut -f2,3 -d " " `
	echo $A$B >> $PINMUX_FROM_DTS
done < $TMP2

MISMATCH=false
while read
do
	PIN=`echo $REPLY | sed "s/\(.*\) .*/\1/"`
	VALUE=`echo $REPLY | sed "s/.* \(.*\)/\1/"`
	LINE="pin [0-9]\{1,3\} (44e10${PIN}.0) 000000${VALUE} pinctrl-single"
	#echo pin: $PIN, value: $VALUE
	#echo $LINE
	grep -iq "$LINE" "$PINS" 
	if [ $? -eq 0 ]
	then
		:
		# echo found $PIN $VALUE && continue
	else
		ACTUAL=`grep -i "$PIN" $PINS | sed "s/.*44e10${PIN}.0) 000000\([0-9a-fA-F]\{,2\}\).*/\1/"`
		echo ${PIN} has $ACTUAL instead of ${VALUE} 
		MISMATCH=true
	fi
done < $PINMUX_FROM_DTS
[ "$MISMATCH" = true ] && echo "WARNING: there was a mismatch between the dts settings and the pinmux settings" || echo "The pinmuxer settings match the dts"

diff -wq $PINMUX_REFERENCE $PINMUX_FROM_DTS &>/dev/null && exit

echo The following differences have been found between the dts and the prescribed pinmuxer settings:
diff -w $PINMUX_REFERENCE $PINMUX_FROM_DTS
