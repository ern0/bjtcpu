out1:	equ 3072
out2:	equ 3073
beep:	equ 3074
arr:	equ 3072
rnd:	equ 3073
key0:	equ 3074
key1:	equ 3075
cord_x:	equ 3076
cord_y:	equ 3077
ch_h:	equ 3078
ch_l:	equ 3079

time_a:	equ 4085
time_b:	equ 4084
time_c:	equ 4083

num:	equ 4095
zeros:	equ 4094

timing:	equ 4

	jmp begin

db_PH: 0,0,0,0,0,0,0,0,0,0,0,0 ;place holder (12 Nibble)

;array for operands (C=A+B) ORG 0x010
	
db_A:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
db_B:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1
db_C:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0

begin:	mvi a,0
	sta num
	
reset:	lda db_A2
	sta db_A
	lda db_B2
	sta db_B
	lda db_C2
	sta db_C
	lda num
	ad0 db_1
	sta num
	sta reset+1
	sta reset+5
	sta reset+9
	sta reset+13
	sta reset+17
	sta reset+21
	jnz reset
	
	mvi a,15
	sta num
	
	
	call clrscr
	mvi a,0
	sta cord_x
	sta ch_h
	sta cord_y

;BCD adding code
bcd0:	lda db_A+15
	ad0 db_B+15	;adding with c=0
	sta db_C+15
	jc cis1
	jnc cis0

bcd1:	lda db_A+15
	ad1 db_B+15	;adding with c=1
	sta db_C+15
	jc cis1
	jnc cis0

cis1:	ad0 db_6	;the c=1, add 6 and put
	sta db_C+15
	call dec
	jmp bcd1

cis0:	ad0 db_6	;-10, <9?
	jc cis1_2
	jnc cis0_2

cis0_2:	ad0 db_10	;change back the number, it was correct BCD
	sta db_C+15
	call dec
	jmp bcd0
	
cis1_2:	sta db_C+15	;6 already added at subtracting 10
	call dec
	jmp bcd1

;index decrementing routine
dec:	lda num
	ad0 db_F	;decrement the length
	sta num
	sta bcd0+1	;decrementing db_A index
	sta bcd0+5	;decrementing db_B index
	sta bcd0+9	;decrememting db_C index
	sta bcd1+1	;decrementing db_A index
	sta bcd1+5	;decrementing db_B index
	sta bcd1+9	;decrememting db_C index
	sta cis1+5	;decrementing db_C index
	sta cis0_2+5	;decrementing db_C index
	sta cis1_2+1	;decrementing db_C index
	jnz jp
	mvi a,1
	sta beep
	call moveba
	call put
	lda cord_y
	ad0 db_1
	sta cord_y
	mvi a,0
	sta beep
jp:	mvi a,0
	call delay
	ret

	

;put array db_C to the screen
put:	lda db_C
	jnz put2
	lda cord_x
	ad0 db_1	;increment the x by 1
	sta cord_x
	sta put+1	;new first number coordinate
	sta put2+1
	jnz put
	jmp exit
put2:	lda db_C
	sta ch_l
	lda cord_x
	ad0 db_1	;increment the x by 1
	sta cord_x
	sta put+1	;new first number coordinate
	sta put2+1
	jnz put2
exit:	mvi a,0	
	ret

;move B to A, C to B
moveba:	lda db_B
	sta db_A
	lda moveba+1
	ad0 db_1	;db_B increment
	sta moveba+1
	sta moveba+5	;db_A increment
	jnz moveba
movecb:	lda db_C
	sta db_B
	lda movecb+1
	ad0 db_1	;db_C increment
	sta movecb+1
	sta movecb+5	;db_B increment
	jnz movecb	
	ret
	
clrscr:	mvi a,15
	sta ch_h
	mvi a,0
	sta cord_x
l_1:	ad0 db_F
	sta cord_y
	lda cord_x
l_2:	ad0 db_F
	sta cord_x
	sta ch_l
	jnz l_2
	lda cord_y
	jnz l_1
	sta ch_h
	ret	
	
delay:	mvi a,timing
	sta time_a
	sta time_b
	sta time_c
de0:	mvi a,timing
de1:	ad0 db_F
	jnz de1
	lda time_a
	ad0 db_F
	sta time_a
	jnz de0
	lda time_b
	ad0 db_F
	sta time_b
	jnz de0
	lda time_c
	ad0 db_F
	sta time_c
	jnz de0
	ret
	
db_0:	0
db_1:	1
db_2:	2
db_3:	3
db_4:	4
db_5:	5
db_6:	6
db_7:	7
db_8:	8
db_9:	9
db_10:	10
db_11:	11
db_12:	12
db_13:	13
db_14:	14
db_F:	15

db_PH2:	0,0,0,0,0,0,0,0,0,0,0,0

db_A2:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
db_B2:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1
db_C2:	0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0


halt:	jmp halt
	end