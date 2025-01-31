# 4-bit trans CPU

Some draft notes taken at Csoki klub

## Keyboard

key0: 3074
key1: 3075

key0: if not 0, some key has pressed
key1: upper nibble, clear-on-read

## Display

coordx: 3076
coordy: 3077
chh: 3078 
chl: 3079

write chh: no effeect
write chl: puts the char to x, y

16x16 char

## Codes

00: "0"
01: "1"
0a: "A"
0b: "B"
...
(Gábor will send me the code table)

## Buttons

arr: 3072

F: none
B: up
D: left
E: down
7: right

## LED numeric display 

out1: left digit
out2: right digit 

## Random generaror

rnd: 3073

## Buzzer + LED

beep: 3074

0/1

## ISA

See article:
https://github.com/ern0/bjtcpu.git

12-bit addressing
lo, mid, hi order 

## Call mechanism

Implemented with assembler macros

call -> 
 mvi + sta x3  to RET address

ret ->
 jmp back, assembler finds it and generates a label

